import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { GeneratedQuestion } from "@/types/qcm";
import { loadSessions, saveSessions } from "@/lib/storage";
import { randomUUID } from "crypto";


const QuestionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  rationale: z.string().optional(),
  propositions: z.array(
    z.object({
      statement: z.string(),
      isTrue: z.boolean(),
      explanation: z.string()
    })
  ).length(5)
});

const PayloadSchema = z.object({
  questions: z.array(QuestionSchema)
});

export async function POST(req: NextRequest) {
  try {
    // Import internal module to avoid pdf-parse's index.js debug code reading a test file
    const pdfParseMod: any = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (pdfParseMod?.default ?? pdfParseMod) as (buf: Buffer) => Promise<{ text: string }>;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const formData = await req.formData();
    const file = formData.get("pdf");
    const filenameFromData = formData.get("filename");
    const numQuestions = Number(formData.get("numQuestions") || 8);
    const language = "fr";
    const tone = String(formData.get("tone") || "concis");

    if (!file && !filenameFromData) {
      return NextResponse.json({ error: "Missing PDF file or filename" }, { status: 400 });
    }
    let buffer: Buffer;
    let originalName = "document.pdf";
    if (file && file instanceof Blob) {
      originalName = (file as any)?.name || "document.pdf";
      const arrayBuffer = await file.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      // read from data folder
      const name = String(filenameFromData);
      const full = path.join(process.cwd(), "data", name);
      const arr = await fs.readFile(full);
      buffer = Buffer.from(arr);
      originalName = name;
    }
    const sessionId = randomUUID();
    const startedAt = Date.now();
    await upsertSession({
      id: sessionId,
      filename: originalName,
      size: (file as any)?.size || 0,
      createdAt: new Date().toISOString(),
      numQuestions,
      tone,
      status: "processing",
    });

    const pdf = await pdfParse(buffer);
    const text = (pdf.text || "").replace(/\s+/g, " ").trim();

    if (!text) {
      return NextResponse.json({ error: "Could not read text from PDF" }, { status: 400 });
    }

    const maxContext = 12000; // characters, conservative
    const contextSnippet = text.slice(0, maxContext);

    const system = `You are an expert exam writer creating high-quality QCM questions (True/False propositions). Return ONLY valid JSON.`;
    const user = `Source content (may be truncated):\n\n${contextSnippet}\n\nTask: Generate ${numQuestions} QCM questions in ${language}. Each question must have:\n- a short 'topic' (<= 120 chars)\n- exactly 5 propositions\n- for each proposition: 'statement' (short, specific), 'isTrue' (boolean), and a concise 'explanation' (1-2 sentences).\n- a final 'rationale' (3-6 sentences) summarizing the reasoning across the 5 propositions and clarifying tricky points.\n- Ensure facts are faithful to the source. Prefer coverage across distinct subtopics.\nTone: ${tone}.\nReturn JSON with shape: {"questions": [{"id": string, "topic": string, "rationale": string, "propositions": [{"statement": string, "isTrue": boolean, "explanation": string}] }] }`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_QCM_MODEL!,
      temperature: 1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      max_completion_tokens: 1800,
      response_format: { type: "json_object" }
    });

    const content = completion.choices[0]?.message?.content || "";
    let json: unknown;
    try {
      json = JSON.parse(content);
    } catch {
      await upsertSession({ id: sessionId, status: "failed", error: "Invalid JSON from model", durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Model returned invalid JSON" }, { status: 500 });
    }

    const parsed = PayloadSchema.safeParse(json);
    if (!parsed.success) {
      await upsertSession({ id: sessionId, status: "failed", error: "Invalid payload shape", durationMs: Date.now() - startedAt });
      return NextResponse.json({ error: "Invalid payload shape", issues: parsed.error.issues }, { status: 500 });
    }

    const questions: GeneratedQuestion[] = parsed.data.questions;
    await upsertSession({ id: sessionId, status: "completed", durationMs: Date.now() - startedAt });
    return NextResponse.json({ questions });
  } catch (e: any) {
    console.error(e);
    // attempt to record failure if a sessionId was created in scope
    try {
      const msg = e?.message || "Internal error";
      // best effort: update last processing session
      await upsertSession({ id: undefined, status: "failed", error: msg });
    } catch {}
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}

// Ensure this route is treated as dynamic and runs on Node.js runtime
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const preferredRegion = ["auto"];

// --- Local sessions persistence ---
type SessionUpdate = {
  id?: string;
  filename?: string;
  size?: number;
  createdAt?: string;
  numQuestions?: number;
  tone?: string;
  status: "processing" | "completed" | "failed";
  durationMs?: number;
  error?: string;
};

async function upsertSession(update: SessionUpdate) {
  let list: any[] = await loadSessions();
  if (!Array.isArray(list)) list = [];

  if (update.id) {
    const idx = list.findIndex((s: any) => s.id === update.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...update };
    } else {
      list.push({
        id: update.id,
        filename: update.filename,
        size: update.size,
        createdAt: update.createdAt,
        numQuestions: update.numQuestions,
        tone: update.tone,
        status: update.status,
        durationMs: update.durationMs ?? 0,
        error: update.error ?? null,
      });
    }
  } else {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.status === "processing") {
        list[i] = { ...list[i], ...update };
        break;
      }
    }
  }

  await saveSessions(list);
}


