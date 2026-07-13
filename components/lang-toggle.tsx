"use client";

import { useLang } from "@/components/lang-context";
import { cn } from "@/lib/utils";

/** Toggle PT/EN no header (ao lado do tema). */
export function LangToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="flex items-center rounded-md border border-border bg-background p-0.5 text-xs font-medium">
      {(["pt", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={cn(
            "rounded px-2 py-1 uppercase transition-colors",
            lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
