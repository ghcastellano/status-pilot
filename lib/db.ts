/** Server-side PostgreSQL repository. Identifiers are allowlisted; values are bound parameters. */
import pg from 'pg';
import { attachDatabasePool } from '@vercel/functions';
import { TABLE_COLUMNS, PRIMARY_KEYS } from './db-schema';

type Row = Record<string, any>;
type Table = keyof typeof TABLE_COLUMNS;
type Options = { where?: Row; columns?: string; orderBy?: string; ascending?: boolean; limit?: number; single?: 'required' | 'optional'; onConflict?: string };
type Result = { data: any; error: { message: string; code?: string } | null };
export type QueryExecutor = (text: string, values: unknown[]) => Promise<{ rows: Row[] }>;
const quote = (name: string) => `"${name}"`;
const jsonColumns = new Set(['stages', 'signals', 'metrics']);
const value = (column: string, input: unknown) => jsonColumns.has(column) && input != null ? JSON.stringify(input) : input;

export class Database {
  constructor(private execute: QueryExecutor) {}
  private table(table: string): asserts table is Table {
    if (!Object.prototype.hasOwnProperty.call(TABLE_COLUMNS, table)) throw new Error('Unknown database table');
  }
  private column(table: Table, column: string) {
    if (!(TABLE_COLUMNS[table] as readonly string[]).includes(column)) throw new Error('Unknown database column');
    return quote(column);
  }
  private columns(table: Table, columns = '*') {
    return columns === '*' ? '*' : columns.split(',').map(c => this.column(table, c.trim())).join(', ');
  }
  private where(table: Table, input: Row, params: unknown[]) {
    const clauses = Object.entries(input).map(([key, val]) => {
      const col = this.column(table, key);
      if (val === undefined) throw new Error('Undefined filter value');
      if (val === null) return `${col} IS NULL`;
      params.push(value(key, val));
      return `${col} = $${params.length}`;
    });
    return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  }
  private async result(sql: string, params: unknown[], options: Options = {}): Promise<Result> {
    try {
      const {rows} = await this.execute(sql, params);
      const data = rows.map(r => r.row);
      if (options.single) {
        if (data.length > 1 || (options.single === 'required' && data.length !== 1)) return {data:null,error:{message:'Expected one database record'}};
        return {data:data[0] ?? null,error:null};
      }
      return {data,error:null};
    } catch (error) {
      // Driver messages can contain row contents or provider credentials. Keep them out of responses/logs.
      return {data:null,error:{message:'Database operation failed',code:(error as {code?:string}).code}};
    }
  }
  async select(table: string, options: Options = {}): Promise<Result> {
    this.table(table);
    const params: unknown[] = [];
    let sql = `SELECT ${this.columns(table,options.columns)} FROM public.${quote(table)}${this.where(table,options.where ?? {},params)}`;
    if (options.orderBy) sql += ` ORDER BY ${this.column(table,options.orderBy)} ${options.ascending === false ? 'DESC' : 'ASC'}`;
    if (options.limit !== undefined) {
      if (!Number.isSafeInteger(options.limit) || options.limit < 0 || options.limit > 10000) throw new Error('Invalid query limit');
      params.push(options.limit); sql += ` LIMIT $${params.length}`;
    }
    return this.result(`SELECT to_jsonb(q) AS row FROM (${sql}) q`,params,options);
  }
  private async write(operation: 'insert' | 'upsert', table: string, input: Row | Row[], options: Options): Promise<Result> {
    this.table(table);
    const rows = Array.isArray(input) ? input : [input];
    if (!rows.length) return {data:[],error:null};
    const columns = [...new Set(rows.flatMap(r => Object.keys(r).filter(k => r[k] !== undefined)))];
    if (!columns.length) throw new Error('Empty database record');
    const params: unknown[] = [];
    const tuples = rows.map(row => '(' + columns.map(c => {
      if (row[c] === undefined) return 'DEFAULT';
      params.push(value(c,row[c]));return `$${params.length}`;
    }).join(', ') + ')');
    let sql = `INSERT INTO public.${quote(table)} (${columns.map(c=>this.column(table,c)).join(', ')}) VALUES ${tuples.join(', ')}`;
    if (operation === 'upsert') {
      const keys = (options.onConflict ?? PRIMARY_KEYS[table]).split(',').map(c=>c.trim());
      const updates = columns.filter(c => !keys.includes(c));
      sql += ` ON CONFLICT (${keys.map(c=>this.column(table,c)).join(', ')}) DO ` + (updates.length ? `UPDATE SET ${updates.map(c=>`${this.column(table,c)} = EXCLUDED.${this.column(table,c)}`).join(', ')}` : 'NOTHING');
    }
    sql += ` RETURNING ${this.columns(table,options.columns)}`;
    return this.result(`WITH changed AS (${sql}) SELECT to_jsonb(changed) AS row FROM changed`,params,options);
  }
  insert(table: string, input: Row | Row[], options: Options = {}) { return this.write('insert',table,input,options); }
  upsert(table: string, input: Row | Row[], options: Options = {}) { return this.write('upsert',table,input,options); }
  async update(table: string, patch: Row, options: Options): Promise<Result> {
    this.table(table);
    if (!Object.keys(options.where ?? {}).length) throw new Error('Updates require a filter');
    const params: unknown[] = [];
    const assignments = Object.entries(patch).filter(([,v])=>v!==undefined).map(([key,val])=>{params.push(value(key,val));return `${this.column(table,key)} = $${params.length}`;});
    if (!assignments.length) throw new Error('Empty database update');
    const sql = `UPDATE public.${quote(table)} SET ${assignments.join(', ')}${this.where(table,options.where!,params)} RETURNING ${this.columns(table,options.columns)}`;
    return this.result(`WITH changed AS (${sql}) SELECT to_jsonb(changed) AS row FROM changed`,params,options);
  }
  async delete(table: string, options: Options): Promise<Result> {
    this.table(table);
    if (!Object.keys(options.where ?? {}).length) throw new Error('Deletes require a filter');
    const params: unknown[] = [];
    const sql = `DELETE FROM public.${quote(table)}${this.where(table,options.where!,params)} RETURNING ${this.columns(table,options.columns)}`;
    return this.result(`WITH changed AS (${sql}) SELECT to_jsonb(changed) AS row FROM changed`,params,options);
  }
  async rpc(name: string, args: Row): Promise<Result> {
    const functions: Record<string, {sql:string; params:unknown[]}> = {
      consume_ai_budget: {sql:'SELECT public.consume_ai_budget($1) AS row',params:[args.p_actor]},
      replace_team_history: {sql:'SELECT public.replace_team_history($1,$2::jsonb) AS row',params:[args.p_team,JSON.stringify(args.p_history)]},
      replace_team_snapshot: {sql:'SELECT public.replace_team_snapshot($1,$2::jsonb,$3::jsonb,$4,$5,$6::jsonb) AS row',params:[args.p_team,JSON.stringify(args.p_issues),args.p_sprints == null ? null : JSON.stringify(args.p_sprints),args.p_board_type ?? null,args.p_source ?? 'basic',args.p_history == null ? null : JSON.stringify(args.p_history)]},
    };
    if (!Object.prototype.hasOwnProperty.call(functions,name)) throw new Error('Unknown database function');
    const {sql,params} = functions[name];
    return this.result(sql,params,{single:'required'});
  }
}

let database: Database | undefined;
export function getDatabase(): Database {
  if (database) return database;
  if (typeof window !== 'undefined') throw new Error('Database access is server-only');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({connectionString,max:5,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
  pool.on('error',()=>console.error('Database pool connection failed'));
  attachDatabasePool(pool);
  database = new Database((text,values)=>pool.query(text,values));
  return database;
}
