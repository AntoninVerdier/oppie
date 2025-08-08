import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

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
    
    const filePath = path.join(process.cwd(), "data", `session-${sessionId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const j = JSON.parse(raw);
    const q = j.questions?.[idx];
    const available = j.questions?.length || 0;
    const total = j.total || j.numQuestions;
    
    // Auto-complete if generation finished but status not updated
    if (available >= total) {
      // Update global sessions list
      const sessionsPath = path.join(process.cwd(), "data", "sessions.json");
      try {
        const sessionsRaw = await fs.readFile(sessionsPath, "utf8");
        const sessions = JSON.parse(sessionsRaw);
        const sessionIndex = sessions.findIndex((s: any) => s.id === sessionId);
        if (sessionIndex !== -1) {
          sessions[sessionIndex].status = "completed";
          sessions[sessionIndex].available = total;
          await fs.writeFile(sessionsPath, JSON.stringify(sessions, null, 2), "utf8");
        }
      } catch {}
    }
    
    if (!q) return NextResponse.json({ available, total, status: available >= total ? "completed" : "processing" }, { status: 404 });
    return NextResponse.json({ question: q, available, total, status: available >= total ? "completed" : "processing" });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}


