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

export async function POST(req: NextRequest) {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const { sessionId } = await req.json();
    if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

    const dir = path.join(process.cwd(), "data");
    const filePath = path.join(dir, `session-${sessionId}.json`);
    const raw = await fs.readFile(filePath, "utf8");
    const session: SessionFile = JSON.parse(raw);

    if (session.questions.length >= session.numQuestions) {
      return NextResponse.json({ done: true, generated: 0 });
    }

    const remaining = session.numQuestions - session.questions.length;
    const batch = Math.min(2, remaining); // small batches to reduce latency spikes

    const system = `Vous êtes un expert universitaire en médecine et en rédaction d'examens exigeants. Vous produisez des QCM Vrai/Faux qui testent compréhension fine, pièges, exceptions et détails cliniques. Retournez UNIQUEMENT du JSON valide.`;
    const user = `Contenu source (peut être tronqué):\n\n${session.contextSnippet}\n\nTâche: Générer ${batch} QCMs en fr. Exigences de qualité:\n- Sous-sujets distincts, non triviaux; éviter la redondance avec les QCMs précédents.\n- Nuances, cas limites, pièges; rester fidèle au contenu.\n- Variabilité des propositions (vrai/faux) et formulations.\n- EXACTEMENT 5 propositions par QCM: 'statement' (court, spécifique), 'isTrue' (booléen), 'explanation' (1-2 phrases).\n- 'rationale' (3-6 phrases) par QCM.\n- Clés OBLIGATOIRES: statement, isTrue, explanation, topic, rationale.\n- Ton: ${session.tone}.\nFormat STRICT: {"questions":[{"id": string, "topic": string, "rationale": string, "propositions": [{"statement": string, "isTrue": boolean, "explanation": string}]}]}`;

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
    let json: any = null;
    try { json = JSON.parse(content); } catch { json = null; }
    if (!json || !Array.isArray(json.questions)) return NextResponse.json({ error: "Invalid payload" }, { status: 500 });
    const newQuestions = (json.questions as any[]).map((q) => normalizeQuestion(q)).filter(Boolean) as GeneratedQuestion[];
    session.questions.push(...newQuestions);
    if (session.questions.length >= session.numQuestions) session.status = "completed";
    await fs.writeFile(filePath, JSON.stringify(session, null, 2), "utf8");

    // Reflect progress in global sessions list
    await upsertGlobalSession({
      id: session.id,
      filename: session.filename,
      numQuestions: session.numQuestions,
      tone: session.tone,
      status: session.status,
      createdAt: session.createdAt,
    });

    return NextResponse.json({ done: session.status === "completed", generated: newQuestions.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

function normalizeQuestion(q: any): GeneratedQuestion | null {
  if (!q) return null;
  const props = Array.isArray(q.propositions)
    ? q.propositions.map((p: any) => ({
        statement: String(p.statement ?? p.text ?? "").trim(),
        isTrue: Boolean(p.isTrue ?? p.truth ?? false),
        explanation: String(p.explanation ?? p.justification ?? "").trim(),
      }))
    : [];
  if (props.length !== 5) return null;
  const id = String(q.id || randomUUID());
  const topic = String(q.topic ?? q.title ?? "Sujet").trim();
  const rationale = q.rationale ? String(q.rationale) : undefined;
  return { id, topic, rationale, propositions: props };
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


