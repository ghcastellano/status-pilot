import { NextResponse } from "next/server";
import { getJiraConnection } from "@/lib/jira-connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jira/status — estado da conexão (Basic) com o Jira.
 * Nunca lança para o cliente: em qualquer erro devolve { connected: false }.
 */
export async function GET() {
  try {
    const conn = await getJiraConnection();
    if (!conn) {
      return NextResponse.json({ connected: false, site_url: null, account_name: null });
    }
    return NextResponse.json({
      connected: true,
      site_url: conn.site_url,
      account_name: conn.account_name,
    });
  } catch {
    return NextResponse.json({ connected: false, site_url: null, account_name: null });
  }
}
