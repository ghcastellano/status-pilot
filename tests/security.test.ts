import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {allowedIdentity,sameOrigin} from '../lib/auth/policy';
import {validateForgeScope} from '../lib/forge-auth';

test('workspace allowlist uses verified identity, confirmed email, and exact origin',()=>{
 const user={id:'owner',email:'owner@example.com'};
 assert.equal(allowedIdentity(user,undefined),false);
 assert.equal(allowedIdentity(user,'owner'),true);
 assert.equal(allowedIdentity(user,undefined,'owner@example.com'),false);
 assert.equal(allowedIdentity({...user,email_confirmed_at:'2026-10-14'},undefined,'owner@example.com'),true);
 for(const origin of ['https://evil.example','https://app.example.evil.example','http://app.example'])assert.equal(sameOrigin(new Request('https://app.example/api/teams',{headers:{origin}})),false);
 assert.equal(sameOrigin(new Request('https://app.example/api/teams',{headers:{origin:'https://app.example'}})),true);
});
test('every connected handler applies authorization independently of middleware',()=>{
 function routes(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?routes(`${dir}/${e.name}`):[`${dir}/${e.name}`]);}
 for(const f of routes('app/api').filter(f=>f.endsWith('/route.ts')&&!/\/(demo|auth|forge)\//.test(f))){const s=readFileSync(f,'utf8');assert.doesNotMatch(s,/export async function (GET|POST|PUT|PATCH|DELETE)/,f);assert.match(s,/withWorkspaceAuth/,f);}
});
test('Forge is bound to a single verified installation and canonical API host',()=>{
 const cloud='12345678-1234-1234-1234-123456789abc',installation='ari:cloud:ecosystem::installation/example';
 const claims={context:{cloudId:cloud},app:{installationId:installation,apiBaseUrl:`https://api.atlassian.com/ex/jira/${cloud}`}};
 assert.equal(validateForgeScope(claims,cloud,installation),claims.app.apiBaseUrl);
 assert.throws(()=>validateForgeScope({...claims,app:{...claims.app,apiBaseUrl:'http://169.254.169.254'}},cloud,installation));
 assert.throws(()=>validateForgeScope(claims,cloud,'other'));
});
test('database migration preserves data, denies browser roles, enforces quotas and rolls back failed snapshots',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const schema=readFileSync('supabase/schema.sql','utf8'),migration=readFileSync('supabase/migrations/202610140001_workspace_hardening.sql','utf8');
  await db.exec(schema);await db.exec(migration);
  await db.exec("insert into teams(id,name,board_type) values ('a','A','kanban'),('b','B','kanban')");
  await db.exec(schema);await db.exec(migration);
  assert.equal((await db.query<{count:number}>('select count(*)::int as count from teams')).rows[0].count,2);
  await db.exec('set role anon');await assert.rejects(db.query('select * from jira_connections'));await assert.rejects(db.query("select consume_ai_budget('x')"));await db.exec('reset role');
  const row={id:'a::1',team_id:'a',issue_key:'X-1',title:'Existing item',type:'task',status:'To Do',current_stage:'Backlog',created_at:'2026-10-14T00:00:00Z',stages:[]};
  await db.query('select replace_team_snapshot($1,$2::jsonb)',['a',JSON.stringify([row])]);
  await assert.rejects(db.query('select replace_team_snapshot($1,$2::jsonb)',['a',JSON.stringify([{...row,type:'invalid'}])]));
  assert.equal((await db.query<{title:string}>('select title from issues where id=$1',[row.id])).rows[0].title,'Existing item');
  await assert.rejects(db.query('select replace_team_snapshot($1,$2::jsonb)',['b',JSON.stringify([row])]));
  const history={team_id:'a',as_of:'2026-10-14',board_type:'kanban',tier:1,metrics:{}};
  await db.query('select replace_team_history($1,$2::jsonb)',['a',JSON.stringify([history])]);
  await assert.rejects(db.query('select replace_team_history($1,$2::jsonb)',['a',JSON.stringify([{...history,as_of:'invalid-date'}])]));
  assert.equal((await db.query<{count:number}>("select count(*)::int as count from metrics_history where team_id='a'")).rows[0].count,1);
  const answers=await Promise.all(Array.from({length:15},()=>db.query<{r:{allowed:boolean}}>("select consume_ai_budget('owner') as r")));
  assert.equal(answers.filter(r=>r.rows[0].r.allowed).length,10);
  for(let i=0;i<90;i++)await db.query('select consume_ai_budget($1)',['user-'+i]);
  assert.equal((await db.query<{r:{allowed:boolean}}>("select consume_ai_budget('new-user') as r")).rows[0].r.allowed,false);
 } finally {await db.close();}
});
