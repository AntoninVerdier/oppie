import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { GeneratedQuestion } from "@/types/qcm";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const QuestionSchema = z.object({
  id: z.string(),
  topic: z.string(),
  rationale: z.string().optional(),
  propositions: z.array(
    z.object({
      statement: z.string(),
      isTrue: z.boolean(),
      explanation: z.string(),
    })
  ).length(5),
});

const PayloadSchema = z.object({
  questions: z.array(QuestionSchema),
});

type SessionFile = {
  id: string;
  filename: string;
  createdAt: string;
  numQuestions: number;
  tone: string;
  status: "processing" | "completed" | "failed";
  contextSnippet: string;
  questions: GeneratedQuestion[];
};

async function writeSessionFile(session: SessionFile) {
  const dir = path.join(process.cwd(), "data");
  const filePath = path.join(dir, `session-${session.id}.json`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf8");
}

function normalizeFirst(raw: any): GeneratedQuestion | null {
  const arr = raw?.questions;
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const q = arr[0];
  if (!q) return null;
  let props = Array.isArray(q.propositions)
    ? q.propositions.map((p: any) => ({
        statement: String(p.statement ?? p.text ?? "").trim(),
        isTrue: Boolean(p.isTrue ?? p.truth ?? false),
        explanation: String(p.explanation ?? p.justification ?? "").trim(),
      }))
    : [];
  props = props.filter((p: any) => p.statement && p.explanation);
  if (props.length < 5) return null;
  if (props.length > 5) props = props.slice(0, 5);
  const id = String(q.id || randomUUID());
  const topic = String(q.topic ?? q.title ?? "Sujet").trim();
  const rationale = q.rationale ? String(q.rationale) : undefined;
  return { id, topic, rationale, propositions: props };
}

export async function POST(req: NextRequest) {
  try {
    const pdfParseMod: any = await import("pdf-parse/lib/pdf-parse.js");
    const pdfParse = (pdfParseMod?.default ?? pdfParseMod) as (buf: Buffer) => Promise<{ text: string }>;
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const formData = await req.formData();
    const filenameFromData = String(formData.get("filename") || "");
    const numQuestions = Number(formData.get("numQuestions") || 8);
    const tone = String(formData.get("tone") || "concis");
    const language = "fr";
    if (!filenameFromData) {
      return NextResponse.json({ error: "Missing filename" }, { status: 400 });
    }

    const full = path.join(process.cwd(), "data", filenameFromData);
    const arr = await fs.readFile(full);
    const buffer = Buffer.from(arr);

    const sessionId = randomUUID();
    const pdf = await pdfParse(buffer);
    const text = (pdf.text || "").replace(/\s+/g, " ").trim();
    if (!text) {
      return NextResponse.json({ error: "Could not read text from PDF" }, { status: 400 });
    }
    const contextSnippet = text.slice(0, 12000);

    const session: SessionFile = {
      id: sessionId,
      filename: filenameFromData,
      createdAt: new Date().toISOString(),
      numQuestions,
      tone,
      status: "processing",
      contextSnippet,
      questions: [],
    };
    await writeSessionFile(session);

    const system = `Vous êtes un expert universitaire en médecine et en rédaction d'examens exigeants. Vous produisez des QCM Vrai/Faux qui testent compréhension fine, pièges, exceptions et détails cliniques. Retournez UNIQUEMENT du JSON valide.`;
    const user = `Contenu source (peut être tronqué):\n\n${contextSnippet}\n\nTâche: Générer 1 QCM en ${language}. Exigences de qualité:\n- Couvrir un sous-sujet précis et non trivial; éviter la redondance avec d'autres items du même document.\n- Introduire des nuances (cas limites, exceptions, pièges fréquents), en restant fidèle au contenu.\n- Variabilité des propositions: mélanger vrai et faux; éviter formulations évidentes.\n- 'topic' (<=120 car.) doit être précis.\n- EXACTEMENT 5 propositions. Pour chaque proposition: 'statement' (court, spécifique), 'isTrue' (booléen), 'explanation' (1-2 phrases claires, concrètes, référencées au contenu).\n- Fournir un 'rationale' (3-6 phrases) synthétisant la logique globale et les distinctions fines.\n- Clés OBLIGATOIRES: statement, isTrue, explanation, topic, rationale.\n- Ton: ${tone}.\nFormat de sortie STRICT: {"questions":[{"id": string, "topic": string, "rationale": string, "propositions": [{"statement": string, "isTrue": boolean, "explanation": string}]}]}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content || "";
    let json: any;
    try { json = JSON.parse(content); } catch { json = null; }
    let firstQuestion: GeneratedQuestion | null = null;
    if (json) {
      firstQuestion = normalizeFirst(json);
    }
    if (!firstQuestion) {
      // retry once with stricter wording
      const completion2 = await client.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user + "\n\nIMPORTANT: exactement 5 propositions avec les clés exactes demandées." },
        ],
        response_format: { type: "json_object" },
      });
      const content2 = completion2.choices[0]?.message?.content || "";
      try { json = JSON.parse(content2); } catch { json = null; }
      if (json) firstQuestion = normalizeFirst(json);
    }
    if (!firstQuestion) {
      return NextResponse.json({ error: "Invalid payload shape" }, { status: 500 });
    }

    // Persist first question in session file
    session.questions.push(firstQuestion);
    await writeSessionFile(session);

    // Also upsert into global sessions list
    await upsertGlobalSession({ id: sessionId, filename: filenameFromData, numQuestions, tone, status: "processing", createdAt: session.createdAt });

    return NextResponse.json({ sessionId, firstQuestion, numQuestions });
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


