"use client";
import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDemo, DemoLauncher } from './demo-workspace';
import { useT } from './lang-context';
import { Button } from './ui/button';

export function WorkspaceAccess({children}: {children: React.ReactNode}) {
  const demo=useDemo(), path=usePathname(), t=useT();
  const [state,setState]=React.useState<'loading'|'allowed'|'denied'>('loading');
  React.useEffect(()=>{
    if(demo || path==='/login') return;
    let active=true;
    fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{if(active)setState(d?.user?'allowed':'denied')}).catch(()=>{if(active)setState('denied')});
    return ()=>{active=false};
  },[demo,path]);
  if(demo || path==='/login') return <>{children}</>;
  if(state==='loading') return <p>{t('Verificando acesso…','Verifying access…')}</p>;
  if(state==='denied') return <div className="mx-auto max-w-xl space-y-6 py-8">
    <h1 className="text-2xl font-semibold">{t('Workspace protegido','Protected workspace')}</h1>
    <p>{t('Entre com uma conta autorizada para acessar os dados conectados, ou explore a demonstração.','Sign in with an authorized account to access connected data, or explore the sample workspace.')}</p>
    <Button asChild><Link href="/login">{t('Entrar','Sign in')}</Link></Button><DemoLauncher />
  </div>;
  return <><div className="mb-4 flex justify-end"><Button variant="ghost" onClick={async()=>{const r=await fetch('/api/auth/session',{method:'DELETE'});if(r.ok)window.location.assign('/login')}}>{t('Sair','Sign out')}</Button></div>{children}</>;
}
