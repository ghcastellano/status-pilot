/**
 * scripts/apply-schema.ts — aplica supabase/schema.sql no Postgres do Supabase.
 * Usa SUPABASE_DB_URL (connection string direct, porta 5432).
 *
 * Rodar: npx tsx scripts/apply-schema.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import pg from "pg";

async function main() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error("Defina SUPABASE_DB_URL no .env.local (connection string do Postgres).");

  const sql = readFileSync("supabase/schema.sql", "utf8");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✓ conectado ao Postgres");
  await client.query(sql);
  console.log("✓ schema aplicado (tabelas criadas)");
  const { rows } = await client.query(
    "select table_name from information_schema.tables where table_schema='public' order by table_name"
  );
  console.log("tabelas:", rows.map((r) => r.table_name).join(", "));
  await client.end();
}

main().catch((e) => {
  console.error("Erro:", e.message || e);
  process.exit(1);
});
