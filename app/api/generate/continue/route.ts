import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { GeneratedQuestion } from "@/types/qcm";
import { loadSessions, saveSessions, readSessionFile, writeSessionFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getOrigin(req: NextRequest) {
  const envUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  return envUrl || new URL(req.url).origin;
}

async function getSessionId(req: NextRequest): Promise<string | null> {
  const { searchParams } = new URL(req.url);
  const qp = searchParams.get("id") || searchParams.get("sid") || searchParams.get("sessionId");
  if (qp) return qp;

  try {
    const clone = req.clone();
    const ct = clone.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await clone.json().catch(() => ({}));
      if (j?.sessionId || j?.id || j?.sid) return (j.sessionId || j.id || j.sid) as string;
    }
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      const v = (fd.get("sessionId") || fd.get("id") || fd.get("sid")) as string | null;
      if (v) return v;
    }
  } catch {}
  return null;
}

// Minimal per-instance lock
const localLocks = new Set<string>();

export async function POST(req: NextRequest) {
  const sessionId = await getSessionId(req);
  if (!sessionId) return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });

  if (localLocks.has(sessionId)) {
    return NextResponse.json({ status: "busy" }, { status: 202 });
  }
  localLocks.add(sessionId);

  try {
    let sessions = await loadSessions();
    let i = sessions.findIndex((s: any) => s.id === sessionId);

    let file = await readSessionFile(sessionId);
    if (i === -1) {
      // Fallback: synthesize meta from session file if registry missing (KV eventual consistency)
      if (!file) {
        return NextResponse.json({ error: "Session file missing" }, { status: 404 });
      }
      const synthesized = {
        id: sessionId,
        filename: file.filename,
        tone: file.tone || "concis",
        createdAt: new Date().toISOString(),
        status: (file.questions?.length || 0) >= (file.total || 0) ? "completed" : "processing",
        total: file.total || 8,
        available: file.questions?.length || 0,
        chunks: file.chunks || [],
        chunkOrder: file.chunkOrder || [],
        usedChunks: file.usedChunks || [],
      } as any;
      sessions = [synthesized, ...sessions];
      await saveSessions(sessions);
      i = 0;
    }

    const meta = sessions[i];
    if (!file) file = await readSessionFile(sessionId);
    if (!file) return NextResponse.json({ error: "Session file missing" }, { status: 404 });

    const usedChunks: number[] = file.usedChunks || meta.usedChunks || [];
    const chunkOrder: number[] = meta.chunkOrder || [];
    const total: number = meta.total ?? file.total ?? 8;

    if (usedChunks.length >= Math.min(total, chunkOrder.length)) {
      meta.status = "completed";
      meta.available = file.questions?.length || usedChunks.length;
      sessions[i] = meta;
      await saveSessions(sessions);
      return NextResponse.json({ status: "done", generated: 0, available: usedChunks.length });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const startedAt = Date.now();
    const TIME_BUDGET_MS = 45_000;   // ~45s budget
    const MAX_PER_CALL = 3;          // generate up to 3 per kick
    let generated = 0;

    while (generated < MAX_PER_CALL && (Date.now() - startedAt) < TIME_BUDGET_MS) {
      const nextIndex = chunkOrder.find((ix) => !usedChunks.includes(ix));
      if (nextIndex === undefined) break;

      const chunk = (meta.chunks || [])[nextIndex];
      if (!chunk || !chunk.content || chunk.content.trim().length < 50) {
        usedChunks.push(nextIndex);
        meta.usedChunks = usedChunks;
        sessions[i] = meta;
        await saveSessions(sessions);
        continue;
      }

      const tone = meta.tone || "concis";
      const prompt = `Tu es un expert en génération de QCM pour des étudiants en médecine. 

CONTEXTE: ${chunk.heading}
CONTENU: ${chunk.content.substring(0, 3000)}${chunk.content.length > 3000 ? '...' : ''}

GÉNÈRE UN SEUL QCM avec exactement 5 propositions Vrai/Faux selon ces critères stricts:

1. STRUCTURE OBLIGATOIRE (JSON valide):
{
  "topic": "Titre du QCM",
  "propositions": [
    {"statement": "Proposition A", "isTrue": true, "explanation": "Justification détaillée"},
    {"statement": "Proposition B", "isTrue": false, "explanation": "Justification détaillée"},
    {"statement": "Proposition C", "isTrue": true, "explanation": "Justification détaillée"},
    {"statement": "Proposition D", "isTrue": false, "explanation": "Justification détaillée"},
    {"statement": "Proposition E", "isTrue": true, "explanation": "Justification détaillée"}
  ],
  "rationale": "Justification globale du QCM couvrant tous les aspects"
}

2. CRITÈRES DE QUALITÉ:
- Questions complexes et nuancées, pas triviaux
- Couvre des subtopics variés du contenu fourni
- Inclut des pièges, exceptions, cas particuliers
- Propositions claires et non ambiguës
- Justifications détaillées et pédagogiques

3. STYLE: ${tone === "concis" ? "Concis et direct" : "Détaillé et explicatif"}

4. COUVERTURE: Focus uniquement sur le contenu de cette section (${chunk.heading})

IMPORTANT: Réponds UNIQUEMENT avec le JSON valide, sans texte avant ou après.`;

      let raw: string | undefined;

      for (let attempt = 0; attempt < 2; attempt++) {
        const comp = await openai.chat.completions.create({
          model: process.env.OPENAI_QCM_MODEL || "gpt-4o-mini",
          messages: [
            { role: "system", content: "Tu produis strictement du JSON valide et rien d'autre." },
            { role: "user", content: prompt }
          ],
          temperature: 0.5,
          max_tokens: 1800,
          response_format: { type: "json_object" },
        });

        raw = comp.choices[0]?.message?.content?.trim();
        if (!raw) throw new Error("OpenAI empty response");

        try {
          const json = JSON.parse((raw.match(/\{[\s\S]*\}/) || [raw])[0]);
          const normalized = normalize(json);
          if (!normalized) throw new Error("Invalid payload shape");

          const question: GeneratedQuestion = {
            ...normalized,
            id: `qcm_${sessionId}_${(file.questions?.length ?? 0)}`,
            chunkId: chunk.id,
            chunkHeading: chunk.heading,
            pageRange: chunk.pageRange
          };

          const updatedFile = {
            ...file,
            questions: [...(file.questions || []), question],
            usedChunks: [...usedChunks, nextIndex],
            currentIndex: (file.currentIndex ?? 0),
            total: total,
          };
          await writeSessionFile(sessionId, updatedFile);

          // reflect local state
          file.questions = updatedFile.questions;
          file.usedChunks = updatedFile.usedChunks;

          usedChunks.push(nextIndex);
          meta.usedChunks = usedChunks;
          meta.available = (meta.available || 0) + 1;
          meta.status = usedChunks.length >= Math.min(total, chunkOrder.length) ? "completed" : "processing";
          sessions[i] = meta;
          await saveSessions(sessions);

          generated++;
          break;
        } catch (e) {
          if (attempt === 0) continue; // retry once
          usedChunks.push(nextIndex);
          meta.usedChunks = usedChunks;
          sessions[i] = meta;
          await saveSessions(sessions);
        }
      }
    }

    const done = usedChunks.length >= Math.min(total, (meta.chunkOrder || []).length) || (file.questions?.length || 0) >= total;
    if (done) {
      meta.status = "completed";
      meta.available = file.questions?.length || usedChunks.length;
      sessions[i] = meta;
      await saveSessions(sessions);
    }

    return NextResponse.json({
      status: done ? "done" : "processing",
      generated,
      available: file.questions?.length || usedChunks.length,
      total
    });
  } catch (e: any) {
    console.error("continue error", e);
    return NextResponse.json({ error: e.message || "continue failed" }, { status: 500 });
  } finally {
    localLocks.delete(sessionId);
  }
}

function normalize(parsed: any) {
  const normalized = {
    topic: String(parsed.topic || parsed.Topic || "").trim(),
    propositions: Array.isArray(parsed.propositions)
      ? parsed.propositions.slice(0, 5).map((p: any) => ({
          statement: String(p.statement || p.Statement || "").trim(),
          isTrue: Boolean(p.isTrue),
          explanation: String(p.explanation || p.Explanation || "").trim()
        }))
      : [],
    rationale: String(parsed.rationale || parsed.Rationale || "").trim()
  };

  while (normalized.propositions.length < 5) {
    normalized.propositions.push({
      statement: "Proposition supplémentaire",
      isTrue: false,
      explanation: "Proposition générée automatiquement"
    });
  }
  if (!normalized.topic || normalized.propositions.length !== 5) return null;

  const trueCount = normalized.propositions.filter((p: any) => p.isTrue).length;
  if (trueCount === 0) {
    normalized.propositions[0].isTrue = true;
    normalized.propositions[0].explanation = "Correction automatique: Au moins une réponse doit être vraie.";
  }

  return {
    id: randomUUID(),
    topic: normalized.topic,
    rationale: normalized.rationale,
    propositions: normalized.propositions
  };
}


