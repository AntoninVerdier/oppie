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
    const total = j.numQuestions;
    // Auto-complete if generation finished but status not updated
    if (available >= total && j.status !== "completed") {
      j.status = "completed";
      await fs.writeFile(filePath, JSON.stringify(j, null, 2), "utf8");
      await upsertGlobalSession({
        id: j.id,
        filename: j.filename,
        numQuestions: j.numQuestions,
        tone: j.tone,
        status: j.status,
        createdAt: j.createdAt,
      });
    }
    if (!q) return NextResponse.json({ available }, { status: 404 });
    return NextResponse.json({ question: q, available, total, status: j.status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

type GlobalSessionUpdate = {
  id: string;
  filename: string;
  numQuestions: number;
  tone: string;
  status: "processing" | "completed" | "failed";
  createdAt?: string;
};

async function upsertGlobalSession(update: GlobalSessionUpdate) {
  const dir = path.join(process.cwd(), "data");
  const filePath = path.join(dir, "sessions.json");
  await fs.mkdir(dir, { recursive: true });
  let list: any[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    list = JSON.parse(raw);
    if (!Array.isArray(list)) list = [];
  } catch {}
  const idx = list.findIndex((s: any) => s.id === update.id);
  const base = {
    id: update.id,
    filename: update.filename,
    numQuestions: update.numQuestions,
    tone: update.tone,
    status: update.status,
    createdAt: update.createdAt || new Date().toISOString(),
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...base };
  else list.push(base);
  await fs.writeFile(filePath, JSON.stringify(list, null, 2), "utf8");
}


