"use client";
import * as React from 'react';
import { useT } from '@/components/lang-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DemoLauncher, useDemo } from '@/components/demo-workspace';
export default function LoginPage() {
  const t=useT(),demo=useDemo();
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError(false);
    try {const r=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.get('email'),password:form.get('password')})});if(!r.ok)throw Error();window.location.assign('/');}
    catch {setError(true);}finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-md space-y-6 py-8">
    <h1 className="text-2xl font-semibold">{t('Entrar no workspace','Sign in to the workspace')}</h1>
    <p className="text-sm text-muted-foreground">{t('Acesso restrito às contas autorizadas desta instalação.','Access is restricted to authorized accounts for this installation.')}</p>
    {demo?<p>{t('Saia da demonstração para entrar no workspace conectado.','Exit the sample workspace to sign in to the connected workspace.')}</p>:<form onSubmit={submit} className="space-y-4">
      <label className="block">{t('E-mail','Email')}<Input name="email" type="email" autoComplete="username" required maxLength={254}/></label>
      <label className="block">{t('Senha','Password')}<Input name="password" type="password" autoComplete="current-password" required maxLength={1024}/></label>
      {error&&<p role="alert" className="text-sm text-destructive">{t('Não foi possível entrar. Confira sua conta ou contate o administrador.','Unable to sign in. Check your account or contact the administrator.')}</p>}
      <Button disabled={busy} type="submit">{busy?t('Entrando…','Signing in…'):t('Entrar','Sign in')}</Button>
    </form>}
    <DemoLauncher />
  </div>;
}
