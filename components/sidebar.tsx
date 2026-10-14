"use client";
import { useText } from "@/components/lang-context";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquareText, FileText, Plane, Trophy, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", mobileLabel: "Dashboard", icon: LayoutDashboard },
  { href: "/config", label: "Configurar Jira", mobileLabel: "Jira", icon: Settings },
  { href: "/coaching", label: "Coaching", mobileLabel: "Coaching", icon: Trophy },
  { href: "/ask", label: "Perguntar", mobileLabel: "Perguntar", icon: MessageSquareText },
  { href: "/report", label: "Status Report", mobileLabel: "Report", icon: FileText },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === href : pathname.startsWith(href);

export function Sidebar() {
  const tx = useText();
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card/40 md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Plane className="h-4 w-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">
          Status Pilot
        </span>
      </div>
      <nav className="flex-1 space-y-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {tx(label)}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          {tx("Dados fictícios ·")}{" "}<span className="font-medium">Café Lavra</span>
        </p>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const tx = useText();
  const pathname = usePathname();

  return (
    <nav
      aria-label={tx("Navegação principal")}
      className="fixed inset-x-0 bottom-0 z-30 grid h-16 grid-cols-5 border-t border-border bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      {NAV.map(({ href, label, mobileLabel, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={tx(label)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
              active ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="max-w-full truncate">{tx(mobileLabel)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
