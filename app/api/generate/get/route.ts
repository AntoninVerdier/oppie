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

    // Determine status from sessions registry if available
    let status: "processing" | "completed" | "failed" = available >= total ? "completed" : "processing";
    try {
      const sessions = await loadSessions();
      const sIdx = sessions.findIndex((s: any) => s.id === sessionId);
      if (sIdx !== -1 && sessions[sIdx]?.status) {
        status = sessions[sIdx].status;
      }
    } catch {}
    
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
    
    if (!q) {
      // Best-effort: kick background generation server-side using absolute origin
      try {
        const origin = new URL(req.url).origin;
        await fetch(`${origin}/api/generate/continue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        }).catch(() => {});
      } catch {}
      return NextResponse.json({ available, total, status }, { status: 404 });
    }
    return NextResponse.json({ question: q, available, total, status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}


