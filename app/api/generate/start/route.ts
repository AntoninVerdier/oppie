import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { GeneratedQuestion } from "@/types/qcm";
import { loadSessions, saveSessions, writeSessionFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getOrigin(req: NextRequest) {
  const envUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";
  return envUrl || new URL(req.url).origin;
}

// Enhanced PDF parsing with headings and color detection
async function parsePDFWithStructure(filePath: string) {
  const pdfParse = require("pdf-parse/lib/pdf-parse.js");
  const dataBuffer = fs.readFileSync(filePath);
  
  const options = {
    normalizeWhitespace: true,
    disableCombineTextItems: false,
  };
  
  const data = await pdfParse(dataBuffer, options);
  
  const text = data.text;
  const pages = data.pages || [];
  
  // Parse headings and structure
  const lines = text.split('\n').filter((line: string) => line.trim());
  let chunks: Array<{
    id: string;
    heading: string;
    content: string;
    pageRange: string;
    startPage: number;
    endPage: number;
  }> = [];
  
  let currentChunk = {
    id: '',
    heading: '',
    content: '',
    pageRange: '',
    startPage: 1,
    endPage: 1
  };
  
  // Heading patterns for medical curriculum
  const headingPatterns = [
    /^(\d+\.)\s+(.+)$/,           // "1. Introduction"
    /^(Item\s+\d+)\s+(.+)$/i,     // "Item 1: Introduction"
    /^(\d+\.\d+)\s+(.+)$/,        // "1.1. Subsection"
    /^([A-Z][A-Z\s]+)$/,          // "INTRODUCTION"
    /^(\d+\.\s*[A-Z][^.]*)$/,     // "1. INTRODUCTION"
  ];
  
  let chunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if line is a heading
    let isHeading = false;
    let headingMatch = null;
    
    for (const pattern of headingPatterns) {
      const match = line.match(pattern);
      if (match) {
        isHeading = true;
        headingMatch = match;
        break;
      }
    }
    
    if (isHeading && currentChunk.content.trim()) {
      // Save previous chunk
      if (currentChunk.content.trim()) {
        currentChunk.id = `chunk_${chunkIndex}`;
        chunks.push({ ...currentChunk });
        chunkIndex++;
      }
      
      // Start new chunk
      currentChunk = {
        id: '',
        heading: headingMatch ? headingMatch[2] || headingMatch[1] : line.trim(),
        content: line + '\n',
        pageRange: `Page ${currentChunk.startPage}-${currentChunk.endPage}`,
        startPage: currentChunk.startPage,
        endPage: currentChunk.endPage
      };
    } else {
      // Add to current chunk
      currentChunk.content += line + '\n';
    }
  }
  
  // Add final chunk
  if (currentChunk.content.trim()) {
    currentChunk.id = `chunk_${chunkIndex}`;
    chunks.push({ ...currentChunk });
  }
  
  // If no clear headings found, fallback to token-based chunking
  if (chunks.length < 3) {
    const tokenChunks = chunkByTokens(text, 1500); // ~1500 tokens per chunk
    chunks.length = 0; // Clear existing chunks
    
    tokenChunks.forEach((content, index) => {
      chunks.push({
        id: `chunk_${index}`,
        heading: `Section ${index + 1}`,
        content,
        pageRange: `Pages ${Math.floor(index * pages.length / tokenChunks.length) + 1}-${Math.min((index + 1) * pages.length / tokenChunks.length, pages.length)}`,
        startPage: Math.floor(index * pages.length / tokenChunks.length) + 1,
        endPage: Math.min((index + 1) * pages.length / tokenChunks.length, pages.length)
      });
    });
  }
  
  // Filter out chunks with insufficient content
  chunks = chunks.filter(chunk => {
    const contentLength = chunk.content.trim().length;
    const hasMeaningfulContent = contentLength > 50; // At least 50 characters
    const hasTumourContent = chunk.content.toLowerCase().includes('tumeur') || 
                            chunk.content.toLowerCase().includes('cancer') ||
                            chunk.content.toLowerCase().includes('gliome') ||
                            chunk.content.toLowerCase().includes('métastase') ||
                            chunk.content.toLowerCase().includes('intracrânien');
    
    return hasMeaningfulContent && hasTumourContent;
  });
  
  // If filtering removed too many chunks, fallback to token-based chunking
  if (chunks.length < 2) {
    const tokenChunks = chunkByTokens(text, 1500);
    chunks = tokenChunks.map((content, index) => ({
      id: `chunk_${index}`,
      heading: `Section ${index + 1}`,
      content,
      pageRange: `Pages ${Math.floor(index * pages.length / tokenChunks.length) + 1}-${Math.min((index + 1) * pages.length / tokenChunks.length, pages.length)}`,
      startPage: Math.floor(index * pages.length / tokenChunks.length) + 1,
      endPage: Math.min((index + 1) * pages.length / tokenChunks.length, pages.length)
    }));
  }
  
  return {
    fullText: text,
    chunks,
    totalPages: pages.length,
    hasColorInfo: data.info && data.info.ColorSpace
  };
}

// Fallback token-based chunking
function chunkByTokens(text: string, maxTokens: number): string[] {
  // Simple token estimation (roughly 4 chars per token)
  const estimatedTokens = Math.ceil(text.length / 4);
  const numChunks = Math.ceil(estimatedTokens / maxTokens);
  const chunkSize = Math.ceil(text.length / numChunks);
  
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  
  return chunks;
}

// Generate random chunk order for even coverage
function generateRandomChunkOrder(numChunks: number, numQuestions: number): number[] {
  const allChunks = Array.from({ length: numChunks }, (_, i) => i);
  const shuffled = [...allChunks].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, numQuestions);
}

function normalizeResponse(parsed: any): GeneratedQuestion | null {
  const normalized = {
    topic: String(parsed.topic || parsed.Topic || "").trim(),
    propositions: Array.isArray(parsed.propositions) ? parsed.propositions.slice(0, 5).map((p: any) => ({
      statement: String(p.statement || p.Statement || "").trim(),
      isTrue: Boolean(p.isTrue),
      explanation: String(p.explanation || p.Explanation || "").trim()
    })) : [],
    rationale: String(parsed.rationale || parsed.Rationale || "").trim()
  };

  // Ensure exactly 5 propositions
  while (normalized.propositions.length < 5) {
    normalized.propositions.push({
      statement: "Proposition supplémentaire",
      isTrue: false,
      explanation: "Proposition générée automatiquement"
    });
  }

  if (!normalized.topic || normalized.propositions.length !== 5) {
    return null;
  }

  // Ensure at least one true answer
  const trueCount = normalized.propositions.filter((p: any) => p.isTrue).length;
  if (trueCount === 0) {
    // Force at least one proposition to be true
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const filename = formData.get("filename") as string;
    const numQuestions = parseInt(formData.get("numQuestions") as string) || 8;
    const tone = formData.get("tone") as string || "concis";

    if (!filename) {
      return NextResponse.json({ error: "Filename is required" }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), "data", filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // Parse PDF with structure
    const pdfData = await parsePDFWithStructure(filePath);
    
    if (pdfData.chunks.length === 0) {
      return NextResponse.json({ error: "No content found in PDF" }, { status: 400 });
    }

    // Generate random chunk order for even coverage
    const chunkOrder = generateRandomChunkOrder(pdfData.chunks.length, numQuestions);
    // Pick the first chunk with meaningful content to avoid empty prompts
    function pickFirstValidIndex(order: number[], chunks: typeof pdfData.chunks): number {
      for (const i of order) {
        const c = chunks[i]?.content?.trim() || "";
        if (c.length > 150) return i;
      }
      return order[0];
    }
    
    // Create session
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const sessionData = {
      id: sessionId,
      filename,
      numQuestions,
      tone,
      createdAt: new Date().toISOString(),
      status: "processing",
      total: numQuestions,
      available: 0,
      chunks: pdfData.chunks,
      chunkOrder,
      usedChunks: [] as number[],
      hasColorInfo: pdfData.hasColorInfo
    };

    // Save session metadata
    let sessions = await loadSessions();
    sessions.unshift(sessionData);
    await saveSessions(sessions);

    // Generate first QCM from the first chunk in random order
    const firstChunkIndex = pickFirstValidIndex(chunkOrder, pdfData.chunks);
    const firstChunk = pdfData.chunks[firstChunkIndex];
    
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Tu es un expert en génération de QCM pour des étudiants en médecine. 

CONTEXTE: ${firstChunk.heading}
CONTENU: ${firstChunk.content.substring(0, 3000)}${firstChunk.content.length > 3000 ? '...' : ''}

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

4. COUVERTURE: Focus uniquement sur le contenu de cette section (${firstChunk.heading})

IMPORTANT: Réponds UNIQUEMENT avec le JSON valide, sans texte avant ou après.`;

    // Debug: log prompt metadata (not full content)
    try {
      console.log(
        "OPENAI_PROMPT_START",
        JSON.stringify({
          sessionId,
          firstChunkIndex,
          heading: firstChunk.heading,
          contentLen: firstChunk.content?.length || 0,
          contentSample: firstChunk.content?.slice(0, 180) || "",
        })
      );
    } catch {}

    // Add timeout and retry logic (force JSON with response_format)
    let response;
    let retries = 0;
    const maxRetries = 3;
    const timeout = 30000; // 30 seconds timeout

    while (retries < maxRetries) {
      try {
        const completion = await Promise.race([
          openai.chat.completions.create({
            model: process.env.OPENAI_QCM_MODEL || "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "Tu produis strictement du JSON valide et rien d'autre." },
              { role: "user", content: prompt }
            ],
            temperature: 0.5,
            max_tokens: 1800,
            response_format: { type: "json_object" },
          }),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error("Request timeout")), timeout)
          )
        ]) as any;

        response = completion.choices[0]?.message?.content?.trim();
        try {
          console.log(
            "OPENAI_RESPONSE_START",
            JSON.stringify({ sessionId, len: response?.length || 0, sample: response?.slice(0, 180) || "" })
          );
        } catch {}
        if (!response) throw new Error("Empty response from OpenAI");
        break; // Success, exit retry loop
      } catch (error: any) {
        retries++;
        console.error(`Generation attempt ${retries} failed:`, error.message);
        
        if (retries >= maxRetries) {
          throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }

    // Parse and validate response
    let parsed;
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : response;
      parsed = JSON.parse(jsonStr);
    } catch {
      // Retry with stricter instructions
      const retryPrompt = `${prompt}

ERREUR: La réponse n'était pas un JSON valide. 

RÈGLES STRICTES:
1. Réponds UNIQUEMENT avec du JSON valide
2. Pas de texte avant ou après le JSON
3. Utilise des guillemets doubles pour les chaînes
4. Pas de virgules trailing
5. Pas de commentaires

EXEMPLE DE FORMAT EXACT:
{"topic":"Exemple","propositions":[{"statement":"A","isTrue":true,"explanation":"B"},{"statement":"C","isTrue":false,"explanation":"D"}],"rationale":"E"}`;

      // Retry with timeout and retry logic
      let retryResponse;
      let retryAttempts = 0;
      const maxRetryAttempts = 2;

      while (retryAttempts < maxRetryAttempts) {
        try {
          const retryCompletion = await Promise.race([
            openai.chat.completions.create({
              model: process.env.OPENAI_QCM_MODEL || "gpt-3.5-turbo",
              messages: [
                { role: "system", content: "Tu produis strictement du JSON valide et rien d'autre." },
                { role: "user", content: retryPrompt }
              ],
              temperature: 0.3,
              max_tokens: 1500,
              response_format: { type: "json_object" },
            }),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error("Retry request timeout")), timeout)
            )
          ]) as any;

          retryResponse = retryCompletion.choices[0]?.message?.content?.trim();
          if (!retryResponse) throw new Error("Empty retry response from OpenAI");
          break; // Success, exit retry loop
        } catch (error: any) {
          retryAttempts++;
          console.error(`Retry attempt ${retryAttempts} failed:`, error.message);
          
          if (retryAttempts >= maxRetryAttempts) {
            throw new Error(`Retry failed after ${maxRetryAttempts} attempts: ${error.message}`);
          }
          
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * retryAttempts));
        }
      }

      const jsonMatch = retryResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : retryResponse;
      parsed = JSON.parse(jsonStr);
    }

    const normalized = normalizeResponse(parsed);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid payload shape" }, { status: 500 });
    }

    // Add chunk metadata to the question
    const question: GeneratedQuestion = {
      ...normalized,
      id: `qcm_${sessionId}_0`,
      chunkId: firstChunk.id,
      chunkHeading: firstChunk.heading,
      pageRange: firstChunk.pageRange
    };

    // Save first QCM to session file
    const sessionFileData = {
      sessionId,
      questions: [question],
      usedChunks: [firstChunkIndex],
      currentIndex: 0,
      total: numQuestions,
      tone,
      filename,
      chunks: pdfData.chunks,
      chunkOrder,
      contextSnippet: firstChunk.content.substring(0, 1000)
    };
    await writeSessionFile(sessionId, sessionFileData);

    // Update session status
    sessionData.available = 1;
    sessionData.usedChunks = [firstChunkIndex];
    sessions[0] = sessionData;
    await saveSessions(sessions);

    // Kick background generation immediately after first persist
    try {
      const origin = getOrigin(request);
      fetch(`${origin}/api/generate/continue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive: true
      }).catch(() => {});
    } catch {}

    return NextResponse.json({
      sessionId,
      question,
      total: numQuestions,
      available: 1,
      status: "processing",
      chunkInfo: {
        totalChunks: pdfData.chunks.length,
        hasColorInfo: pdfData.hasColorInfo,
        chunkOrder: chunkOrder // Show all chunks for debugging
      }
    });

  } catch (error: any) {
    console.error("Error in generate/start:", error);
    return NextResponse.json(
      { error: error.message || "Failed to start generation" },
      { status: 500 }
    );
  }
}


