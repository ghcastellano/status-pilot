import { config } from 'dotenv';
config({path:'.env.local'});
import { readFileSync,readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
async function main() {
  const url=process.env.DATABASE_URL_UNPOOLED;
  if(!url) throw new Error('DATABASE_URL_UNPOOLED is required');
  const local=['localhost','127.0.0.1','::1'].includes(new URL(url).hostname);
  const client=new pg.Client({connectionString:url,ssl:local?false:{rejectUnauthorized:true}});
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(hashtextextended('status-pilot:migrations',0))");
    await client.query('begin');
    await client.query(readFileSync('db/schema.sql','utf8'));
    await client.query('create table if not exists public.status_pilot_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now())');
    await client.query('revoke all on public.status_pilot_migrations from public,status_pilot_runtime');
    for(const name of readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort()) {
      const sql=readFileSync(`db/migrations/${name}`,'utf8');const checksum=createHash('sha256').update(sql).digest('hex');
      const {rows}=await client.query('select checksum from public.status_pilot_migrations where name=$1',[name]);
      if(rows.length) {if(rows[0].checksum!==checksum)throw new Error(`Applied migration changed: ${name}`);continue;}
      await client.query(sql);
      await client.query('insert into public.status_pilot_migrations(name,checksum) values($1,$2)',[name,checksum]);
      console.log(`Applied ${name}`);
    }
    await client.query('commit');
  } catch(error) {await client.query('rollback');throw error;} finally {await client.end();}
}
main().catch(()=>{console.error('Database migration failed; transaction rolled back. Check configuration and migration compatibility.');process.exitCode=1;});
