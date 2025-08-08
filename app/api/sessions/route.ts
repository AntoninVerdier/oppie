import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "sessions.json");
    const raw = await fs.readFile(filePath, "utf8");
    const list = JSON.parse(raw);
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


