import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { randomUUID } from "crypto";
import { GeneratedQuestion } from "@/types/qcm";
import { loadSessions, saveSessions, readSessionFile, writeSessionFile } from "@/lib/storage";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Simple QCM generation
async function generateQCM(chunk: string, tone: string): Promise<GeneratedQuestion | null> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

     const prompt = `Génère un QCM médical basé sur ce contenu:

${chunk.substring(0, 1000)}

Crée exactement 5 propositions Vrai/Faux avec cette structure JSON:

{
  "topic": "Titre du QCM",
  "propositions": [
    {"statement": "Proposition 1", "isTrue": true, "explanation": "Justification"},
    {"statement": "Proposition 2", "isTrue": false, "explanation": "Justification"},
    {"statement": "Proposition 3", "isTrue": true, "explanation": "Justification"},
    {"statement": "Proposition 4", "isTrue": false, "explanation": "Justification"},
    {"statement": "Proposition 5", "isTrue": true, "explanation": "Justification"}
  ],
  "rationale": "Explication globale"
}

Style: ${tone === "concis" ? "Concis" : "Détaillé"}`;

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_QCM_MODEL!,
      messages: [
        { role: "system", content: "Tu produis strictement du JSON valide." },
        { role: "user", content: prompt }
      ],
             temperature: 1,
       max_completion_tokens: 800,
      response_format: { type: "json_object" },
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) return null;

    const parsed = JSON.parse(response);
    
    // Validate structure
    if (!parsed.topic || !parsed.propositions || !Array.isArray(parsed.propositions) || parsed.propositions.length !== 5) {
      return null;
    }

    // Ensure at least one true answer
    const trueCount = parsed.propositions.filter((p: any) => p.isTrue).length;
    if (trueCount === 0) {
      parsed.propositions[0].isTrue = true;
    }

    return {
      id: randomUUID(),
      topic: parsed.topic,
      propositions: parsed.propositions.map((p: any) => ({
        id: randomUUID(),
        statement: p.statement,
        isTrue: p.isTrue,
        explanation: p.explanation
      })),
      rationale: parsed.rationale
    };
  } catch (error) {
    console.error("QCM generation error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get sessionId from request
  const user = await requireAuth(request as any);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  let sessionId: string;
    try {
      const body = await request.json();
      sessionId = body.sessionId;
    } catch {
      const url = new URL(request.url);
      sessionId = url.searchParams.get("sessionId") || "";
    }

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Read session file
    const sessionData = await readSessionFile(sessionId);
    if (!sessionData || (sessionData as any).userId !== user.id) {
      return NextResponse.json({ error: 'not found' }, { status: 404 });
    }
    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { chunks, chunkOrder, tone, total, available } = sessionData;
    let { questions } = sessionData;

    if (!chunks || !chunkOrder || available >= total) {
      return NextResponse.json({ error: "No more QCMs to generate" }, { status: 400 });
    }

         // Generate QCMs in batches of 2 (or remaining amount)
     const batchSize = Math.min(2, total - available);
    const newQuestions: GeneratedQuestion[] = [];

    for (let i = 0; i < batchSize; i++) {
             const chunkIndex = (available + i) % chunks.length;
       const chunk = chunks[chunkIndex];
       
       const qcm = await generateQCM(chunk.substring(0, 1200), tone);
      if (qcm) {
        newQuestions.push(qcm);
      }
    }

    if (newQuestions.length === 0) {
      return NextResponse.json({ error: "Failed to generate QCMs" }, { status: 500 });
    }

    // Update session file
    const updatedQuestions = [...questions, ...newQuestions];
    const newAvailable = available + newQuestions.length;
    const isCompleted = newAvailable >= total;

    await writeSessionFile(sessionId, {
      ...sessionData,
      questions: updatedQuestions,
      available: newAvailable,
      status: isCompleted ? "completed" : "processing"
    });

    // Update sessions registry
    const sessions = await loadSessions();
    const sessionIndex = sessions.findIndex(s => s.id === sessionId);
    if (sessionIndex !== -1) {
      sessions[sessionIndex].available = newAvailable;
      sessions[sessionIndex].status = isCompleted ? "completed" : "processing";
      await saveSessions(sessions);
    }

    // Continue generating if not complete
    if (!isCompleted) {
      const origin = request.headers.get("origin") || new URL(request.url).origin;
      fetch(`${origin}/api/generate/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
        keepalive: true
      }).catch(() => {});
    }

    return NextResponse.json({
      sessionId,
      generated: newQuestions.length,
      available: newAvailable,
      total,
      completed: isCompleted
    });

  } catch (error: any) {
    console.error("Error in generate/continue:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


