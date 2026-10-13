"use client";

import * as React from "react";
import Link from "next/link";
import { FlaskConical, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/components/lang-context";

const DemoContext = React.createContext(false);
const DemoLockedContext = React.createContext(false);
export const useDemo = () => React.useContext(DemoContext);

export function DemoProvider({ active, locked = false, children }: { active: boolean; locked?: boolean; children: React.ReactNode }) {
  return <DemoContext.Provider value={active}><DemoLockedContext.Provider value={locked}>{children}</DemoLockedContext.Provider></DemoContext.Provider>;
}

function useDemoSession() {
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const t = useT();
  async function change(active: boolean) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/demo/session", { method: active ? "POST" : "DELETE" });
      if (!response.ok) throw new Error(t("Não foi possível alterar a demonstração. Tente novamente.", "Unable to change the sample session. Please try again."));
      // Preserve the previous team selection when switching workspaces.
      try {
        const key = "status-pilot:selected-team";
        const previous = "status-pilot:previous-team";
        if (active) {
          sessionStorage.setItem(previous, localStorage.getItem(key) ?? "");
          localStorage.setItem(key, "espresso");
        } else {
          const saved = sessionStorage.getItem(previous);
          if (saved) localStorage.setItem(key, saved);
          else localStorage.removeItem(key);
          sessionStorage.removeItem(previous);
        }
      } catch { /* A disabled storage API must not prevent demo access. */ }
      window.location.assign(active ? "/" : "/config");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setPending(false);
    }
  }
  return { pending, error, change };
}

export function DemoBanner() {
  const active = useDemo();
  const locked = React.useContext(DemoLockedContext);
  const t = useT();
  const { pending, error, change } = useDemoSession();
  if (!active) return null;
  return <aside className="border-b border-primary/20 bg-primary/5 px-4 py-3 md:px-8" aria-label="Sample workspace">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-3">
        <FlaskConical className="mt-1 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{t("Demonstração · somente leitura", "Sample workspace · read-only")}</p>
          <p className="text-xs text-muted-foreground">{t("Dados fictícios de 03 jun 2026. Análises ilustrativas, sem chamadas de IA ou conexões externas.", "Synthetic data as of 03 Jun 2026. Illustrative analysis; no AI calls or external connections.")}</p>
        </div>
      </div>
      {!locked && <Button size="sm" variant="outline" disabled={pending} onClick={() => void change(false)}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t("Sair da demonstração", "Exit sample workspace")}
      </Button>}
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </aside>;
}

export function DemoLauncher() {
  const active = useDemo();
  const t = useT();
  const { pending, error, change } = useDemoSession();
  return <section className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 to-background p-6" aria-labelledby="demo-title">
    <div className="mb-3 flex items-center gap-2 text-primary">
      <FlaskConical className="h-5 w-5" aria-hidden="true" />
      <span className="text-xs font-semibold uppercase tracking-wider">{t("Conheça o produto", "Product walkthrough")}</span>
    </div>
    <h2 id="demo-title" className="text-xl font-semibold">{t("Explore um cenário completo", "Explore a complete delivery scenario")}</h2>
    <p className="mt-2 text-sm text-muted-foreground">{t("Abra um workspace de exemplo com dois times, Scrum e Kanban, histórico de entregas, métricas, planos de coaching e relatórios ilustrativos. Nenhuma conta do Jira é necessária.", "Open a sample workspace with Scrum and Kanban teams, delivery history, metrics, coaching plans, and illustrative reports. No Jira account required.")}</p>
    <p className="mt-3 text-xs text-muted-foreground">{t("Dados fictícios, isolados das suas conexões. Você pode sair a qualquer momento.", "Fictional data, isolated from your connections. Exit at any time.")}</p>
    <div className="mt-5">
      {active ? <Button asChild><Link href="/">{t("Explorar dashboard", "Explore dashboard")}<ArrowRight className="h-4 w-4" /></Link></Button>
        : <Button disabled={pending} onClick={() => void change(true)}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          {pending ? t("Preparando…", "Preparing…") : t("Abrir demonstração", "Open sample workspace")}
        </Button>}
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}
