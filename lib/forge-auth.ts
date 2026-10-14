import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
const jwks=createRemoteJWKSet(new URL('https://forge.cdn.prod.atlassian-dev.net/.well-known/jwks.json'));
export class ForgeAuthError extends Error { constructor(message='Invalid Forge invocation.',readonly status=401){super(message);} }
export interface ForgeContext {cloudId:string;apiBaseUrl:string;installationId:string;systemToken:string;claims:JWTPayload}
export function validateForgeScope(claims:JWTPayload, cloudId:string, installationId:string) {
  const app=claims.app as {installationId?:string;apiBaseUrl?:string}|undefined;
  const context=claims.context as {cloudId?:string}|undefined;
  const canonical=`https://api.atlassian.com/ex/jira/${cloudId}`;
  if(!/^[a-f0-9-]{36}$/i.test(cloudId) || context?.cloudId!==cloudId || app?.installationId!==installationId || app?.apiBaseUrl!==canonical) throw new ForgeAuthError('Forge installation is not authorized.',403);
  return canonical;
}
export async function verifyForgeRequest(headers:Headers,audience=process.env.FORGE_REMOTE_AUDIENCE):Promise<ForgeContext> {
  const cloudId=process.env.FORGE_ALLOWED_CLOUD_ID,installationId=process.env.FORGE_ALLOWED_INSTALLATION_ID;
  // Audience is the Forge application ARI, not the remote URL.
  if(!audience?.startsWith('ari:cloud:ecosystem::app/') || !cloudId || !installationId) throw new ForgeAuthError('Forge integration is not configured.',503);
  const authorization=headers.get('authorization')??'',systemToken=headers.get('x-forge-oauth-system')?.trim();
  if(!authorization.startsWith('Bearer ') || !systemToken)throw new ForgeAuthError();
  let claims:JWTPayload;
  try {({payload:claims}=await jwtVerify(authorization.slice(7),jwks,{audience,issuer:'forge/invocation-token',requiredClaims:['exp','iat'],clockTolerance:5}));}catch{throw new ForgeAuthError();}
  const apiBaseUrl=validateForgeScope(claims,cloudId,installationId);
  return {cloudId,apiBaseUrl,installationId,systemToken,claims};
}
