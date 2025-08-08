import { NextRequest, NextResponse } from "next/server";
import { readSessionFile, loadSessions, saveSessions } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");
    const indexStr = searchParams.get("index");
    if (!sessionId || !indexStr) return NextResponse.json({ error: "Missing id or index" }, { status: 400 });
    const idx = parseInt(indexStr, 10);
    if (Number.isNaN(idx) || idx < 0) return NextResponse.json({ error: "Bad index" }, { status: 400 });
    
    const j = await readSessionFile(sessionId);
    if (!j) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const q = j.questions?.[idx];
    const available = j.questions?.length || 0;
    const total = j.total || j.numQuestions;
    
    // Auto-complete if generation finished but status not updated
    if (available >= total) {
      try {
        const sessions = await loadSessions();
        const sessionIndex = sessions.findIndex((s: any) => s.id === sessionId);
        if (sessionIndex !== -1) {
          sessions[sessionIndex].status = "completed";
          sessions[sessionIndex].available = total;
          await saveSessions(sessions);
        }
      } catch {}
    }
    
    if (!q) return NextResponse.json({ available, total, status: available >= total ? "completed" : "processing" }, { status: 404 });
    return NextResponse.json({ question: q, available, total, status: available >= total ? "completed" : "processing" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}


