import { NextResponse } from "next/server";
import { loadSessions } from "@/lib/storage";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
  const user = requireAuth(request as any);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const list = (await loadSessions()).filter(s => s.userId === user.id);
    if (!Array.isArray(list)) return NextResponse.json([]);
    // newest first
    list.sort((a: any, b: any) => (new Date(b.createdAt || b.timestamp || 0).getTime()) - (new Date(a.createdAt || a.timestamp || 0).getTime()));
    return NextResponse.json(list.map((s: any) => ({
      ...s,
      createdAt: s.createdAt || (s.timestamp ? new Date(s.timestamp).toISOString() : null),
    })));
  } catch {
    return NextResponse.json([]);
  }
}


