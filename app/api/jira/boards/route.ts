import { NextResponse } from "next/server";
import { jiraProviderFromEnv } from "@/lib/jira";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AgileBoard {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string; projectName?: string };
}

/**
 * GET /api/jira/boards — lista todos os boards Agile do site conectado.
 * Pagina até isLast (cap ~500). Se o Jira não estiver conectado, o
 * OAuthProvider lança "Jira não conectado…" → responde 409 com boards vazio.
 */
export async function GET() {
  try {
    const jira = jiraProviderFromEnv();
    const boards: Array<{
      id: number;
      name: string;
      type: string;
      projectKey: string | null;
      projectName: string | null;
    }> = [];

    let start = 0;
    for (let guard = 0; guard < 10; guard++) {
      const data = await jira.raw<{
        values?: AgileBoard[];
        isLast?: boolean;
        maxResults?: number;
      }>("GET", `/rest/agile/1.0/board?startAt=${start}&maxResults=50`);
      const values = data.values ?? [];
      for (const v of values) {
        boards.push({
          id: v.id,
          name: v.name,
          type: v.type,
          projectKey: v.location?.projectKey ?? null,
          projectName: v.location?.projectName ?? null,
        });
      }
      if (data.isLast || values.length === 0 || boards.length >= 500) break;
      start += values.length;
    }

    return NextResponse.json({ boards });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, boards: [] }, { status: 409 });
  }
}
