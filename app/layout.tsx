import { WorkspaceAccess } from "@/components/workspace-access";
import { cookies } from "next/headers";
import { DemoProvider, DemoBanner } from "@/components/demo-workspace";
import { DEMO_COOKIE, DEMO_VERSION, isDemoOnly } from "@/lib/demo/session";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TeamProvider } from "@/components/team-context";
import { LangProvider } from "@/components/lang-context";
import { MobileNav, Sidebar } from "@/components/sidebar";
import { TeamSelector } from "@/components/team-selector";
import { ThemeToggle } from "@/components/theme-toggle";
import { LangToggle } from "@/components/lang-toggle";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Status Pilot — Café Lavra",
  description:
    "Leia dados de Jira, acompanhe métricas de fluxo e gere status reports com IA.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
        >
          <LangProvider>
            <DemoProvider active={isDemoOnly() || (await cookies()).get(DEMO_COOKIE)?.value === DEMO_VERSION} locked={isDemoOnly()}>
            <TeamProvider>
              <div className="flex min-h-screen">
                <Sidebar />
                <div className="flex min-w-0 flex-1 flex-col">
                  <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
                    <TeamSelector />
                    <div className="flex items-center gap-2">
                      <LangToggle />
                      <ThemeToggle />
                    </div>
                  </header>
                  <DemoBanner />
                  <main className="flex-1 p-4 pb-20 md:p-8"><WorkspaceAccess>{children}</WorkspaceAccess></main>
                </div>
                <MobileNav />
              </div>
            </TeamProvider>
            </DemoProvider>
          </LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
