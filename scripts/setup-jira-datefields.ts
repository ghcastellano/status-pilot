/**
 * scripts/setup-jira-datefields.ts
 * Cria custom fields de DATA (um por marco do fluxo) via API, adiciona às telas
 * e preenche em cada issue com a data sintética. Assim o cycle time passa a ser
 * calculável a partir de CAMPOS REAIS do Jira (visíveis, filtráveis por JQL) —
 * sem depender de eazyBI/Actionable Agile.
 *
 * Salva o mapa marco→fieldId em scripts/.jira-datefields.json (usado pelo sync).
 *
 * Rodar: npx tsx scripts/setup-jira-datefields.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { dataset, type IssueSeed } from "./data/cafe-aurora";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// marco → (nome do campo no Jira, propriedade na issue do dataset)
const MILESTONES: { key: keyof IssueSeed; field: string }[] = [
  { key: "discovery_started_at", field: "SP Discovery Start" },
  { key: "discovery_done_at", field: "SP Discovery Done" },
  { key: "committed_at", field: "SP Committed" },
  { key: "started_at", field: "SP Dev Start" },
  { key: "review_started_at", field: "SP Review Start" },
  { key: "done_at", field: "SP Work Done" },
  { key: "released_at", field: "SP Released" },
];

const DATETIME_TYPE = "com.atlassian.jira.plugin.system.customfieldtypes:datetime";
const DATETIME_SEARCHER = "com.atlassian.jira.plugin.system.customfieldtypes:datetimerange";

async function main() {
  const jira = new JiraClient(jiraConfigFromEnv());
  console.log("✓ autenticado:", (await jira.myself()).displayName);

  // 1) cria (ou reusa) os custom fields de data
  const all: any = await jira.raw("GET", "/rest/api/3/field");
  const byName = new Map<string, string>(all.map((f: any) => [f.name, f.id]));
  const fieldId: Record<string, string> = {};

  for (const m of MILESTONES) {
    if (byName.has(m.field)) {
      fieldId[m.key as string] = byName.get(m.field)!;
      continue;
    }
    const created: any = await jira.raw("POST", "/rest/api/3/field", {
      name: m.field,
      description: `Marco de fluxo (Status Pilot): ${m.key}`,
      type: DATETIME_TYPE,
      searcherKey: DATETIME_SEARCHER,
    });
    fieldId[m.key as string] = created.id;
    console.log(`  + campo criado: ${m.field} → ${created.id}`);
    await sleep(120);
  }
  writeFileSync("scripts/.jira-datefields.json", JSON.stringify(fieldId, null, 2));
  console.log("✓ campos:", Object.values(fieldId).join(", "));

  // 2) adiciona os campos às telas (para serem settáveis/visíveis)
  const screens: any = await jira.raw("GET", "/rest/api/3/screens?maxResults=100");
  let added = 0;
  for (const screen of screens.values ?? []) {
    let tabs: any;
    try {
      tabs = await jira.raw("GET", `/rest/api/3/screens/${screen.id}/tabs`);
    } catch {
      continue;
    }
    const tabId = tabs?.[0]?.id;
    if (!tabId) continue;
    for (const fid of Object.values(fieldId)) {
      try {
        await jira.raw("POST", `/rest/api/3/screens/${screen.id}/tabs/${tabId}/fields`, { fieldId: fid });
        added++;
      } catch {
        /* já está na tela */
      }
    }
  }
  console.log(`✓ campos adicionados às telas (${added} associações)`);

  // 3) preenche os campos em cada issue
  const keyMap: Record<string, string> = existsSync("scripts/.jira-keymap.json")
    ? JSON.parse(readFileSync("scripts/.jira-keymap.json", "utf8"))
    : {};
  let n = 0,
    fail = 0;
  for (const issue of dataset.issues) {
    const jk = keyMap[issue.id];
    if (!jk) continue;
    const fields: Record<string, unknown> = {};
    for (const m of MILESTONES) {
      const v = issue[m.key] as string | null;
      if (v) fields[fieldId[m.key as string]] = v;
    }
    if (!Object.keys(fields).length) continue;
    try {
      await jira.editIssue(jk, fields);
      n++;
      if (n % 20 === 0) console.log(`  …${n}`);
      await sleep(90);
    } catch (e) {
      fail++;
      if (fail <= 3) console.log(`  ✗ ${jk}:`, (e as Error).message.slice(0, 120));
    }
  }
  console.log(`\n✓ ${n} issues com campos de data preenchidos${fail ? `, ${fail} falhas` : ""}.`);
}

main().catch((e) => {
  console.error("Erro fatal:", e.message || e);
  process.exit(1);
});
