import { NextResponse } from "next/server";
import { fetchTeams } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const teams = await fetchTeams();
    return NextResponse.json({ teams });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
