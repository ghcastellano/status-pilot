"use client";
import * as React from 'react';
import { useT } from '@/components/lang-context';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { DemoLauncher, useDemo } from '@/components/demo-workspace';
export default function LoginPage() {
  const t=useT(),demo=useDemo();
  const [busy,setBusy]=React.useState(false),[error,setError]=React.useState(false);
  const [email,setEmail]=React.useState(''),[sent,setSent]=React.useState(false);
  async function submit(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();const form=new FormData(event.currentTarget);setBusy(true);setError(false);
    try {
      const r=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:sent?'verify-code':'request-code',email,code:form.get('code')})});
      if(!r.ok)throw Error();
      if(sent)window.location.assign('/');else setSent(true);
    } catch {setError(true);}finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-md space-y-6 py-8">
    <h1 className="text-2xl font-semibold">{t('Entrar no workspace','Sign in to the workspace')}</h1>
    <p className="text-sm text-muted-foreground">{t('Acesso restrito às contas autorizadas desta instalação.','Access is restricted to authorized accounts for this installation.')}</p>
    {demo?<p>{t('Saia da demonstração para entrar no workspace conectado.','Exit the sample workspace to sign in to the connected workspace.')}</p>:<form onSubmit={submit} className="space-y-4">
      <label className="block">{t('E-mail','Email')}<Input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={sent||busy}/></label>
      {sent&&<><p className="text-sm">{t('Se esta conta estiver autorizada, você receberá um código por e-mail. Confira também o spam.','If this account is authorized, you will receive a code by email. Check your spam folder too.')}</p>
        <label className="block">{t('Código de acesso','Sign-in code')}<Input name="code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" required minLength={6} maxLength={6} autoFocus/></label></>}
      {error&&<p role="alert" className="text-sm text-destructive">{t('Não foi possível entrar. Confira os dados e tente novamente.','Unable to sign in. Check your details and try again.')}</p>}
      <Button disabled={busy} type="submit">{busy?t('Aguarde…','Please wait…'):sent?t('Verificar e entrar','Verify and sign in'):t('Enviar código de acesso','Send sign-in code')}</Button>
      {sent&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>{setSent(false);setError(false)}}>{t('Usar outro e-mail ou reenviar','Use another email or resend')}</Button>}
    </form>}
    <DemoLauncher />
  </div>;
}
