import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("id");
    if (!sessionId) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const filePath = path.join(process.cwd(), "data", `session-${sessionId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const j = JSON.parse(raw);
    return NextResponse.json({
      id: j.id,
      numQuestions: j.numQuestions,
      tone: j.tone,
      status: j.status,
      count: Array.isArray(j.questions) ? j.questions.length : 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}


