import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const qRaw = searchParams.get("q") || "";
    const limit = Math.max(1, Math.min(2000, parseInt(searchParams.get("limit") || "200", 10) || 200));

    // Normalize (lowercase, strip accents)
    const normalize = (s: string) => s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const q = normalize(qRaw);

    const dir = path.join(process.cwd(), "data");
    // If data folder doesn't exist, return empty list
    try { await fs.access(dir); } catch { return NextResponse.json([]); }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const pdfs: Array<{ name: string; size: number; mtimeMs: number; norm: string } > = [];
    await Promise.all(entries.map(async (e) => {
      if (!e.isFile()) return;
      if (!e.name.toLowerCase().endsWith(".pdf")) return;
      const full = path.join(dir, e.name);
      const st = await fs.stat(full);
      pdfs.push({ name: e.name, size: st.size, mtimeMs: st.mtimeMs, norm: normalize(e.name) });
    }));
    // Sort by recency first
    pdfs.sort((a, b) => b.mtimeMs - a.mtimeMs);

    let result = pdfs;
    if (q) {
      // Rank: startsWith > includes
      const starts = pdfs.filter(p => p.norm.startsWith(q));
      const contains = pdfs.filter(p => !p.norm.startsWith(q) && p.norm.includes(q));
      result = [...starts, ...contains];
    }
    return NextResponse.json(result.slice(0, limit).map(({ norm, ...rest }) => rest));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to list" }, { status: 500 });
  }
}



