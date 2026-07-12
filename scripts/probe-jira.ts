/**
 * scripts/probe-jira.ts — sonda as capacidades do Jira ao vivo:
 *  - tipo do projeto (company-managed/classic vs team-managed/next-gen)
 *  - permissões de admin
 *  - disponibilidade das APIs de status/workflow
 *  - campos de data settáveis (para "base de métricas")
 *
 * Rodar: npx tsx scripts/probe-jira.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { JiraClient, jiraConfigFromEnv } from "../lib/jira";

async function safe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.log(`   ✗ ${label}: ${(e as Error).message.slice(0, 140)}`);
    return null;
  }
}

async function main() {
  const cfg = jiraConfigFromEnv();
  const jira = new JiraClient(cfg);
  const me = await jira.myself();
  console.log("✓ autenticado:", me.displayName, "\n");

  for (const key of [cfg.scrumKey, cfg.kanbanKey]) {
    console.log(`── Projeto ${key} ──`);
    const proj = await safe(`project ${key}`, () =>
      jira.raw<any>("GET", `/rest/api/3/project/${key}`)
    );
    if (proj) {
      console.log(`   nome: ${proj.name}`);
      console.log(`   style: ${proj.style}  (classic = company-managed · next-gen = team-managed)`);
      console.log(`   projectTypeKey: ${proj.projectTypeKey}  id: ${proj.id}`);
    }
    const perms = await safe("mypermissions", () =>
      jira.raw<any>(
        "GET",
        `/rest/api/3/mypermissions?projectKey=${key}&permissions=ADMINISTER,ADMINISTER_PROJECTS,EDIT_ISSUES`
      )
    );
    if (perms?.permissions) {
      const p = perms.permissions;
      console.log(
        `   admin global: ${p.ADMINISTER?.havePermission}` +
          ` · admin projeto: ${p.ADMINISTER_PROJECTS?.havePermission}` +
          ` · edit issues: ${p.EDIT_ISSUES?.havePermission}`
      );
    }
    console.log("");
  }

  console.log("── APIs de status/workflow (company-managed) ──");
  const statuses = await safe("GET /statuses/search", () =>
    jira.raw<any>("GET", "/rest/api/3/statuses/search?maxResults=3")
  );
  if (statuses) console.log(`   ✓ status registry acessível (total≈${statuses.total ?? "?"})`);

  const workflows = await safe("GET /workflow/search", () =>
    jira.raw<any>("GET", "/rest/api/3/workflow/search?maxResults=3")
  );
  if (workflows) console.log(`   ✓ workflow search acessível (total≈${workflows.total ?? "?"})`);

  const schemes = await safe("GET /workflowscheme", () =>
    jira.raw<any>("GET", "/rest/api/3/workflowscheme?maxResults=3")
  );
  if (schemes) console.log(`   ✓ workflow schemes acessível (total≈${schemes.total ?? "?"})`);

  console.log("\n── Campos de data settáveis (base de métricas no Jira) ──");
  const fields = await jira.fields();
  const dateFields = fields.filter((f: any) =>
    ["date", "datetime"].includes(f.schema?.type)
  );
  for (const f of dateFields.slice(0, 15)) {
    console.log(`   • ${f.name} (${f.id}) — ${(f as any).schema?.type}`);
  }
  console.log(`   total de campos de data: ${dateFields.length}`);
}

main().catch((e) => {
  console.error("Erro fatal:", e);
  process.exit(1);
});
