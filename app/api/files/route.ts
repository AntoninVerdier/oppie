import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").toLowerCase();
    const dir = path.join(process.cwd(), "data");
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const pdfs: Array<{ name: string; size: number; mtimeMs: number } > = [];
    await Promise.all(entries.map(async (e) => {
      if (!e.isFile()) return;
      if (!e.name.toLowerCase().endsWith(".pdf")) return;
      const full = path.join(dir, e.name);
      const st = await fs.stat(full);
      pdfs.push({ name: e.name, size: st.size, mtimeMs: st.mtimeMs });
    }));
    pdfs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const filtered = q ? pdfs.filter(p => p.name.toLowerCase().includes(q)) : pdfs;
    return NextResponse.json(filtered.slice(0, 1000));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list" }, { status: 500 });
  }
}


