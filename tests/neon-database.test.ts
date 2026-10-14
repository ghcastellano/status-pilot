import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {Database} from '../lib/db';
import {allowedLoginEmail} from '../lib/auth/policy';

test('Neon repository preserves JSON, dates and numeric values; parameterizes inputs and limits privileges',async()=>{
  const pg=new PGlite();
  try {
    await pg.exec('create role status_pilot_runtime; create role anonymous_visitor;');
    await pg.exec(readFileSync('db/schema.sql','utf8'));
    await pg.exec(readFileSync('db/migrations/202610140001_workspace_hardening.sql','utf8'));
    await pg.exec('set role status_pilot_runtime');
    const db=new Database((sql,params)=>pg.query(sql,params));
    let result=await db.insert('teams',{id:'a',name:"O'Reilly; DROP TABLE teams; --",board_type:'kanban'},{single:'required'});
    assert.equal(result.error,null);assert.equal(result.data.id,'a');
    result=await db.select('teams',{where:{id:'a'},single:'required'});
    assert.match(result.data.name,/DROP TABLE/);assert.equal(typeof result.data.created_at,'string');
    result=await db.upsert('coaching_plans',{team_id:'a',main_gap:'Flow'},{single:'required'});
    assert.equal(result.error,null);assert.equal(result.data.main_gap,'Flow');
    await db.upsert('coaching_plans',{team_id:'a',hypothesis:'Smaller work items'},{single:'required'});
    result=await db.select('coaching_plans',{where:{team_id:'a'},single:'required'});
    assert.equal(result.data.main_gap,'Flow');assert.equal(result.data.hypothesis,'Smaller work items');
    result=await db.upsert('coaching_assessments',{team_id:'a',signals:{ownership:'consistent'}},{single:'required'});
    assert.deepEqual(result.data.signals,{ownership:'consistent'});
    result=await db.insert('coaching_experiments',{team_id:'a',pillar:'flow',behavior:'Limit WIP'},{single:'required'});
    const experiment=result.data.id;assert.equal(typeof experiment,'number');
    result=await db.insert('experiment_comments',{team_id:'a',experiment_id:experiment,author:'Owner',body:'First observation'},{single:'required'});
    assert.equal(result.error,null);
    result=await db.update('coaching_experiments',{status:'done'},{where:{id:experiment},single:'required'});
    assert.equal(result.data.status,'done');
    result=await db.insert('sprints',{id:'s1',team_id:'a',name:'Sprint 1',start_date:'2026-10-01',end_date:'2026-10-14',committed_points:12.5,state:'closed'},{single:'required'});
    assert.equal(result.data.start_date,'2026-10-01');assert.equal(result.data.committed_points,12.5);
    const issue={id:'a::1',team_id:'a',issue_key:'A-1',title:'Item',type:'task',status:'To Do',current_stage:'Backlog',created_at:'2026-10-14T00:00:00Z',stages:[{key:'backlog',at:'2026-10-14T00:00:00Z'}]};
    result=await db.rpc('replace_team_snapshot',{p_team:'a',p_issues:[issue]});
    assert.equal(result.error,null);assert.equal(result.data,1);
    result=await db.select('issues',{where:{team_id:'a'},single:'required'});assert.deepEqual(result.data.stages,issue.stages);
    result=await db.rpc('replace_team_snapshot',{p_team:'a',p_issues:[{...issue,type:'invalid'}]});assert.ok(result.error);
    result=await db.select('issues',{where:{team_id:'a'}});assert.equal(result.data.length,1);
    result=await db.rpc('replace_team_history',{p_team:'a',p_history:[{team_id:'a',as_of:'2026-10-14',board_type:'kanban',tier:1,metrics:{score:3.5}}]});assert.equal(result.error,null);
    result=await db.select('metrics_history',{where:{team_id:'a'},single:'required'});assert.equal(result.data.as_of,'2026-10-14');assert.equal(result.data.metrics.score,3.5);
    for(let i=0;i<10;i++)assert.equal((await db.rpc('consume_ai_budget',{p_actor:'owner'})).data.allowed,true);
    assert.equal((await db.rpc('consume_ai_budget',{p_actor:'owner'})).data.allowed,false);
    await assert.rejects(db.select('neon_auth.user'));
    await assert.rejects(db.select('teams',{columns:'id;drop table teams'}));
    await assert.rejects(db.update('teams',{active:false},{}));
    await assert.rejects(db.delete('teams',{}));
    await assert.rejects(pg.query('create table public.hacked(id int)'));
    await assert.rejects(pg.query('truncate teams cascade'));
    result=await db.delete('coaching_experiments',{where:{id:experiment}});assert.equal(result.error,null);
    result=await db.select('experiment_comments',{where:{experiment_id:experiment}});assert.deepEqual(result.data,[]);
    await pg.exec('reset role; set role anonymous_visitor');
    await assert.rejects(pg.query('select * from jira_connections'));
    await assert.rejects(pg.query("select consume_ai_budget('owner')"));
  } finally {await pg.close();}
});

test('OTP recipient allowlist is exact, case-insensitive and deny-by-default',()=>{
  assert.equal(allowedLoginEmail('owner@example.com',undefined),false);
  assert.equal(allowedLoginEmail('Owner@Example.com',' owner@example.com '),true);
  assert.equal(allowedLoginEmail('owner@example.com.evil','owner@example.com'),false);
});
