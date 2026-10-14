import { getSupabaseAdmin } from './supabase';
export async function replaceTeamSnapshot(teamId:string,issues:unknown[],sprints:unknown[]|null=null,boardType:string|null=null,source='basic',history:unknown[]|null=null) {
  const {data,error}=await getSupabaseAdmin().rpc('replace_team_snapshot',{p_team:teamId,p_issues:issues,p_sprints:sprints,p_board_type:boardType,p_source:source,p_history:history});
  if(error) throw new Error('Snapshot transaction failed');
  return data as number;
}
