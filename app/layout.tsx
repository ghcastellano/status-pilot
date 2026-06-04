import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TeamProvider } from "@/components/team-context";
import { Sidebar } from "@/components/sidebar";
import { TeamSelector } from "@/components/team-selector";
import { ThemeToggle } from "@/components/theme-toggle";

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

export default function RootLayout({
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
          <TeamProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <div className="flex flex-1 flex-col">
                <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
                  <TeamSelector />
                  <ThemeToggle />
                </header>
                <main className="flex-1 p-4 md:p-8">{children}</main>
              </div>
            </div>
          </TeamProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
