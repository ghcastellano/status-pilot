import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sub?: string;
  accent?: boolean;
  insight?: string;
}

export function KpiCard({ label, value, unit, sub, accent, insight }: KpiCardProps) {
  return (
    <Card className="flex flex-col p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className={cn(
            "text-4xl font-semibold tabular-nums tracking-tight",
            accent && "text-primary"
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      {insight && (
        <p className="mt-3 flex items-start gap-1.5 border-t border-border/60 pt-3 text-xs leading-snug text-foreground/80">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <span>{insight}</span>
        </p>
      )}
    </Card>
  );
}
