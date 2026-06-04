/**
 * scripts/populate-jira.ts
 * Popula LS/LK via API com o fluxo dual-track de 10 estágios:
 *   1. cria os ÉPICOS (features) em cada projeto
 *   2. cria cada issue ligada ao seu épico (parent), com labels, story points,
 *      campos de data e descrição com SPMETA (timeline sintética completa)
 *   3. move a issue até o current_stage (transição com match exato de nome)
 *
 * Rodar: npx tsx scripts/populate-jira.ts   (rode cleanup-jira.ts antes p/ rebuild)
 * Idempotente: scripts/.jira-keymap.json guarda o que já foi criado.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { dataset, EPICS, type IssueSeed, type TeamSeed } from "./data/cafe-aurora";
import { buildDescription } from "./jira-desc";

const KEYMAP_PATH = "scripts/.jira-keymap.json";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : undefined);

function mapType(our: IssueSeed["type"], available: Array<{ id: string; name: string }>) {
  const find = (re: RegExp) => available.find((t) => re.test(t.name.toLowerCase()));
  if (our === "bug") return find(/bug|erro|defeito/) ?? find(/task|tarefa/) ?? available[0];
  if (our === "story") return find(/story|hist/) ?? find(/task|tarefa/) ?? available[0];
  return find(/task|tarefa/) ?? available[0];
}

async function moveToStage(jira: JiraClient, key: string, target: string) {
  const { transitions } = await jira.transitions(key);
  const t = transitions.find((tr) => tr.to.name.toLowerCase() === target.toLowerCase());
  if (t) await jira.doTransition(key, t.id);
}

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  const fields = await jira.fields();
  const spField =
    fields.find((f) => /story point estimate/i.test(f.name)) ??
    fields.find((f) => /^story points$/i.test(f.name));
  const startField = fields.find((f) => /^(data de início|start date)$/i.test(f.name));
  const epicNameField = fields.find((f) => /^(epic name|nome do épico)$/i.test(f.name));
  console.log("SP:", spField?.id ?? "n/a", "| start:", startField?.id ?? "n/a", "| epicName:", epicNameField?.id ?? "n/a");

  const keyMap: Record<string, string> = existsSync(KEYMAP_PATH)
    ? JSON.parse(readFileSync(KEYMAP_PATH, "utf8"))
    : {};
  const saveMap = () => writeFileSync(KEYMAP_PATH, JSON.stringify(keyMap, null, 2));

  const projectFor = (team: TeamSeed) =>
    team.board_type === "scrum" ? cfg.scrumKey : cfg.kanbanKey;
  const sprintName = (id: string | null) =>
    id ? dataset.sprints.find((s) => s.id === id)?.name ?? null : null;

  for (const team of dataset.teams) {
    const projectKey = projectFor(team);
    console.log(`\n── ${team.name} → ${projectKey} ──`);
    const types = await jira.issueTypesForProject(projectKey);
    const epicType = types.find((t) => /epic|épico/i.test(t.name));

    // 1) Épicos
    const epicKeyOf: Record<string, string> = {};
    if (epicType) {
      for (const epic of EPICS) {
        const mapKey = `epic:${projectKey}:${epic.key}`;
        if (keyMap[mapKey]) {
          epicKeyOf[epic.key] = keyMap[mapKey];
          continue;
        }
        const f: Record<string, unknown> = {
          project: { key: projectKey },
          summary: epic.name,
          issuetype: { id: epicType.id },
          description: {
            type: "doc",
            version: 1,
            content: [{ type: "paragraph", content: [{ type: "text", text: epic.summary }] }],
          },
        };
        if (epicNameField) f[epicNameField.id] = epic.name;
        try {
          const res = await jira.createIssue(f);
          epicKeyOf[epic.key] = res.key;
          keyMap[mapKey] = res.key;
          saveMap();
          await sleep(120);
        } catch (e) {
          console.log(`  ✗ épico "${epic.name}":`, (e as Error).message.slice(0, 140));
        }
      }
      console.log(`  ✓ ${Object.keys(epicKeyOf).length} épicos`);
    }

    // 2) Issues
    const issues = dataset.issues.filter((i) => i.team_id === team.id);
    let created = 0,
      skipped = 0;
    for (const issue of issues) {
      if (keyMap[issue.id]) {
        skipped++;
        continue;
      }
      const jt = mapType(issue.type, types);
      const labels = [team.jira_label, `epic-${issue.epic}`];
      if (issue.sprint_id) labels.push(`sprint-${issue.sprint_id}`);

      const core: Record<string, unknown> = {
        project: { key: projectKey },
        summary: issue.title,
        issuetype: { id: jt.id },
        labels,
        description: buildDescription(issue, sprintName(issue.sprint_id)),
      };
      const full: Record<string, unknown> = { ...core };
      const epicKey = epicKeyOf[issue.epic];
      if (epicKey) full.parent = { key: epicKey };
      if (spField && issue.story_points != null) full[spField.id] = issue.story_points;
      if (startField && issue.started_at) full[startField.id] = dateOnly(issue.started_at);
      const due = dateOnly(issue.released_at ?? issue.done_at);
      if (due) full.duedate = due;

      try {
        let res;
        try {
          res = await jira.createIssue(full);
        } catch {
          res = await jira.createIssue(core);
        }
        keyMap[issue.id] = res.key;
        saveMap();
        if (issue.current_stage.toLowerCase() !== "opportunity backlog") {
          await moveToStage(jira, res.key, issue.current_stage);
        }
        created++;
        if (created % 15 === 0) console.log(`  …${created}/${issues.length}`);
        await sleep(130);
      } catch (e) {
        console.log(`  ✗ "${issue.title}":`, (e as Error).message.slice(0, 140));
      }
    }
    console.log(`  ✓ ${created} issues criadas, ${skipped} já existiam`);
  }

  saveMap();
  console.log(`\n✓ keymap: ${Object.keys(keyMap).length} itens. Próximo: setup-jira-sprints`);
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});
