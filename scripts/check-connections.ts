/**
 * scripts/check-connections.ts
 * Verifica credenciais do Jira e do Supabase (sem imprimir segredos) e
 * descobre os tipos de issue + status disponíveis nos projetos LS e LK.
 *
 * Rodar:  npx tsx scripts/check-connections.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { JiraClient, jiraConfigFromEnv } from "../lib/jira";
import { getSupabaseAdmin } from "../lib/supabase";

function mask(v: string | undefined): string {
  if (!v) return "(vazio)";
  if (v.length <= 8) return "****";
  return v.slice(0, 4) + "…" + v.slice(-3);
}

async function checkJira() {
  console.log("\n── JIRA ─────────────────────────────────────");
  const cfg = jiraConfigFromEnv();
  console.log("base:", cfg.baseUrl, "| email:", cfg.email, "| token:", mask(cfg.token));
  console.log("projetos:", cfg.scrumKey, "(scrum) ·", cfg.kanbanKey, "(kanban)");
  const jira = new JiraClient(cfg);

  const me = await jira.myself();
  console.log("✓ autenticado como:", me.displayName, me.emailAddress ? `<${me.emailAddress}>` : "");

  const projects = await jira.projects();
  console.log("✓ projetos visíveis:", projects.map((p) => p.key).join(", "));

  for (const key of [cfg.scrumKey, cfg.kanbanKey]) {
    const exists = projects.find((p) => p.key === key);
    if (!exists) {
      console.log(`  ✗ projeto ${key} NÃO encontrado`);
      continue;
    }
    const types = await jira.issueTypesForProject(key);
    const statusGroups = await jira.projectStatuses(key);
    const statusNames = Array.from(
      new Set(statusGroups.flatMap((g) => g.statuses.map((s) => s.name)))
    );
    console.log(`  ${key}: tipos = [${types.map((t) => t.name).join(", ")}]`);
    console.log(`  ${key}: status = [${statusNames.join(", ")}]`);
  }
}

async function checkSupabase() {
  console.log("\n── SUPABASE ─────────────────────────────────");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  console.log("url:", url || "(vazio)", "| service_role:", mask(key));
  if (!url || !key) {
    console.log("✗ faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
    return;
  }
  const sb = getSupabaseAdmin();
  const { error } = await sb.from("teams").select("id").limit(1);
  if (error) {
    if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
      console.log("✓ conectado — mas o schema ainda não foi aplicado (rode schema.sql).");
    } else {
      console.log("✗ erro:", error.message);
    }
  } else {
    console.log("✓ conectado e tabela 'teams' existe.");
  }
}

async function main() {
  let ok = true;
  try {
    await checkJira();
  } catch (e) {
    ok = false;
    console.log("✗ Jira falhou:", (e as Error).message);
  }
  try {
    await checkSupabase();
  } catch (e) {
    ok = false;
    console.log("✗ Supabase falhou:", (e as Error).message);
  }
  console.log("\n" + (ok ? "Pronto." : "Houve erros — veja acima."));
  process.exit(ok ? 0 : 1);
}

main();
