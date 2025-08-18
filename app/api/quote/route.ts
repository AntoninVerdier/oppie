import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "citations_motivation.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    if (quotes.length === 0) {
      return NextResponse.json({ text: "Respire. Avance d'un pas.", category: "gentille" }, { status: 200 });
    }
    const idx = Math.floor(Math.random() * quotes.length);
    const q = quotes[idx];
    return NextResponse.json({ text: q?.text || "Respire. Avance d'un pas.", category: q?.category || null });
  } catch (e: any) {
    return NextResponse.json({ text: "Respire. Avance d'un pas.", category: "gentille" }, { status: 200 });
  }
}


