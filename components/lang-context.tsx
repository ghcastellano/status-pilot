"use client";

/**
 * Idioma PT/EN da UI. Persiste em localStorage (default pt-BR). Espelha o
 * `isPtBR` do scrum-maturity-dashboard-marvin. `useT(pt, en)` devolve a string
 * no idioma ativo — usado para rótulos de métrica (ex.: "Taxa de Acerto do
 * Sprint" / "Sprint Hit Rate") e cabeçalhos.
 */
import * as React from "react";
import { translate, localeFor, formatMetricDisplay, formatWeekLabel } from "@/lib/locales/translate";

type Lang = "pt" | "en";

const LangCtx = React.createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "pt",
  setLang: () => {},
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = React.useState<Lang>("pt");

  React.useEffect(() => {
    try {
      const s = localStorage.getItem("lang");
      if (s === "en" || s === "pt") setLangState(s);
    } catch {
      /* sem localStorage */
    }
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = localeFor(lang);
  }, [lang]);

  const setLang = React.useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem("lang", l);
    } catch {
      /* ignore */
    }
  }, []);

  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

export function useLang() {
  return React.useContext(LangCtx);
}

/** Helper: `const t = useT(); t("Olá", "Hello")`. */
export function useT() {
  const { lang } = useLang();
  return React.useCallback((pt: string, en: string) => (lang === "en" ? en : pt), [lang]);
}

/** Translator for the shared product-copy catalog, including server-owned labels. */
export function useText() {
  const { lang } = useLang();
  return React.useCallback((value: string | null | undefined) => translate(value ?? "", lang), [lang]);
}
export function useLocale() {
  return localeFor(useLang().lang);
}
export function useMetricDisplay() {
  const { lang } = useLang();
  return React.useCallback((value: string) => formatMetricDisplay(value, lang), [lang]);
}
export function useWeekLabel() {
  const { lang } = useLang();
  return React.useCallback((value: string) => formatWeekLabel(value, lang), [lang]);
}
