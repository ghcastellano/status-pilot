/**
 * lib/i18n.ts — rótulos bilíngues (PT/EN) das MÉTRICAS, chaveados pela `key` que
 * o backend já manda no payload de maturidade. O componente escolhe PT ou EN
 * pelo idioma ativo (useLang), então os nomes (ex.: Say-Do) não ficam presos no
 * servidor. Nomes espelham o scrum-maturity-dashboard-marvin quando existem lá.
 */
export const METRIC_LABELS: Record<string, { pt: string; en: string }> = {
  // Say-Do → nome que a Indeed usa no dashboard (pouca gente conhece "say-do").
  sayDo: { pt: "Taxa de Acerto do Sprint", en: "Sprint Hit Rate" },
  cycleP85Days: { pt: "Cycle time (p85)", en: "Cycle time (p85)" },
  flowEff: { pt: "Eficiência de fluxo", en: "Flow efficiency" },
  defectRate: { pt: "Taxa de defeitos", en: "Defect rate" },
  agingBreach: { pt: "Itens parados (aging)", en: "Aging items" },
};

/** Rótulo de uma métrica pela key, no idioma dado; cai no label do servidor. */
export function metricLabel(key: string, lang: "pt" | "en", fallback = ""): string {
  const e = METRIC_LABELS[key];
  return e ? e[lang] : fallback;
}
