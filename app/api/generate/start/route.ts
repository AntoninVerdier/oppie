import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { GeneratedQuestion } from "@/types/qcm";
import { loadSessions, saveSessions, writeSessionFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Simple PDF parsing
async function parsePDF(filePath: string) {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

// Simple chunking by tokens
function chunkText(text: string, maxTokens: number = 1500): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join(" "));
      currentChunk = [word];
      currentLength = word.length;
    } else {
      currentChunk.push(word);
      currentLength += word.length + 1;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(" "));
  }

  return chunks.filter(chunk => chunk.trim().length > 100);
}

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
    const formData = await request.formData();
    const filename = formData.get("filename") as string;
    const numQuestions = parseInt(formData.get("numQuestions") as string) || 8;
    const tone = formData.get("tone") as string || "concis";

    if (!filename) {
      return NextResponse.json({ error: "Filename required" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "data", filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Parse PDF and chunk
    const text = await parsePDF(filePath);
    const chunks = chunkText(text);
    
    if (chunks.length === 0) {
      return NextResponse.json({ error: "No valid content found" }, { status: 400 });
    }

    // Generate first 2 QCMs immediately
    const sessionId = `session_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const questions: GeneratedQuestion[] = [];
    
    // Generate first 2 QCMs
    for (let i = 0; i < Math.min(2, numQuestions); i++) {
           const chunkIndex = i % chunks.length;
     const qcm = await generateQCM(chunks[chunkIndex].substring(0, 1200), tone);
      if (qcm) {
        questions.push(qcm);
      }
    }

    if (questions.length === 0) {
      return NextResponse.json({ error: "Failed to generate QCMs" }, { status: 500 });
    }

    // Save session
    const session = {
      id: sessionId,
      filename,
      numQuestions,
      tone,
      status: "processing",
      createdAt: new Date().toISOString(),
      available: questions.length,
      total: numQuestions,
      questions: questions.map(q => q.id)
    };

    // Save session file
    await writeSessionFile(sessionId, {
      sessionId,
      filename,
      numQuestions,
      tone,
      chunks,
      chunkOrder: Array.from({ length: numQuestions }, (_, i) => i % chunks.length),
      questions: questions,
      available: questions.length,
      total: numQuestions
    });

    // Update sessions registry
    const sessions = await loadSessions();
    sessions.unshift(session);
    await saveSessions(sessions);

    // Start background generation for remaining QCMs
    if (numQuestions > 2) {
      const origin = request.headers.get("origin") || new URL(request.url).origin;
      fetch(`${origin}/api/generate/continue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, remaining: numQuestions - 2 }),
        keepalive: true
      }).catch(() => {});
    }

    return NextResponse.json({
      sessionId,
      question: questions[0],
      available: questions.length,
      total: numQuestions
    });

  } catch (error: any) {
    console.error("Error in generate/start:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


