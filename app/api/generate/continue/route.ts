import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeResponse(parsed: any, sessionId: string, questionIndex: number): any {
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

  // Ensure at least one true answer
  const trueCount = normalized.propositions.filter((p: any) => p.isTrue).length;
  if (trueCount === 0) {
    // Force at least one proposition to be true
    normalized.propositions[0].isTrue = true;
    normalized.propositions[0].explanation = "Correction automatique: Au moins une réponse doit être vraie.";
  }

  return {
    id: `qcm_${sessionId}_${questionIndex}`,
    topic: normalized.topic,
    rationale: normalized.rationale,
    propositions: normalized.propositions
  };
}

export async function POST(request: NextRequest) {
  try {
    const { sessionId } = await request.json();
    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Load session data
    const sessionsPath = path.join(process.cwd(), "data", "sessions.json");
    let sessions = [];
    try {
      sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
    } catch {
      return NextResponse.json({ error: "Sessions file not found" }, { status: 404 });
    }

    const sessionIndex = sessions.findIndex((s: any) => s.id === sessionId);
    if (sessionIndex === -1) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const session = sessions[sessionIndex];
    const sessionFilePath = path.join(process.cwd(), "data", `session-${sessionId}.json`);
    
    // Load session file
    let sessionFileData;
    try {
      sessionFileData = JSON.parse(fs.readFileSync(sessionFilePath, "utf8"));
    } catch {
      return NextResponse.json({ error: "Session file not found" }, { status: 404 });
    }

    // Check if we need to generate more questions
    if (sessionFileData.questions.length >= session.total) {
      // Mark as completed
      session.status = "completed";
      session.available = session.total;
      sessions[sessionIndex] = session;
      fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
      return NextResponse.json({ status: "completed" });
    }

    // Find next unused chunk
    let nextChunkIndex = session.chunkOrder[sessionFileData.questions.length];
    let reuseChunk = false;
    
    if (nextChunkIndex === undefined) {
      // We've used all chunks, but need more questions
      // Reuse a random chunk and ask for different questions
      const usedChunks = sessionFileData.usedChunks;
      const randomUsedIndex = Math.floor(Math.random() * usedChunks.length);
      nextChunkIndex = usedChunks[randomUsedIndex];
      reuseChunk = true;
      
      console.log(`Reusing chunk ${nextChunkIndex} for additional QCM generation`);
    }

    const nextChunk = session.chunks[nextChunkIndex];
    if (!nextChunk) {
      return NextResponse.json({ error: "Chunk not found" }, { status: 400 });
    }

    // Generate QCM for this chunk
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `Tu es un expert en génération de QCM pour des étudiants en médecine. 

CONTEXTE: ${nextChunk.heading}
CONTENU: ${nextChunk.content.substring(0, 3000)}${nextChunk.content.length > 3000 ? '...' : ''}

${reuseChunk ? `⚠️ ATTENTION: Ce contenu a déjà été utilisé pour générer un QCM précédent. 
IMPORTANT: Génère un QCM COMPLÈTEMENT DIFFÉRENT avec des questions, propositions et justifications 
totalement nouvelles. Évite absolument de répéter les mêmes sujets ou formulations.` : ''}

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
${reuseChunk ? '- OBLIGATOIRE: Questions et propositions COMPLÈTEMENT DIFFÉRENTES des QCM précédents' : ''}

3. STYLE: ${session.tone === "concis" ? "Concis et direct" : "Détaillé et explicatif"}

4. COUVERTURE: Focus uniquement sur le contenu de cette section (${nextChunk.heading})

IMPORTANT: Réponds UNIQUEMENT avec le JSON valide, sans texte avant ou après.`;

    // Add timeout and retry logic
    let response;
    let retries = 0;
    const maxRetries = 3;
    const timeout = 30000; // 30 seconds timeout

    while (retries < maxRetries) {
      try {
        const completion = await Promise.race([
          openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error("Request timeout")), timeout)
          )
        ]);

        response = completion.choices[0]?.message?.content?.trim();
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
              model: "gpt-3.5-turbo",
              messages: [{ role: "user", content: retryPrompt }],
              temperature: 0.3,
              max_tokens: 1500,
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("Retry request timeout")), timeout)
            )
          ]);

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

    const normalized = normalizeResponse(parsed, sessionId, sessionFileData.questions.length);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid payload shape" }, { status: 500 });
    }

    // Add chunk metadata to the question
    const question = {
      ...normalized,
      chunkId: nextChunk.id,
      chunkHeading: nextChunk.heading,
      pageRange: nextChunk.pageRange
    };

    // Add question to session file
    sessionFileData.questions.push(question);
    if (!reuseChunk) {
      sessionFileData.usedChunks.push(nextChunkIndex);
    }
    sessionFileData.currentIndex = sessionFileData.questions.length - 1;
    fs.writeFileSync(sessionFilePath, JSON.stringify(sessionFileData, null, 2));

    // Update global session status
    session.available = sessionFileData.questions.length;
    session.usedChunks = sessionFileData.usedChunks;
    if (session.available >= session.total) {
      session.status = "completed";
    }
    sessions[sessionIndex] = session;
    fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));

    return NextResponse.json({
      status: session.status,
      available: session.available,
      total: session.total,
      question
    });

  } catch (error: any) {
    console.error("Error in generate/continue:", error);
    
    // Mark session as failed if we can't continue
    try {
      session.status = "failed";
      session.error = error.message || "Failed to continue generation";
      sessions[sessionIndex] = session;
      fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2));
    } catch (updateError) {
      console.error("Failed to update session status:", updateError);
    }
    
    return NextResponse.json(
      { error: error.message || "Failed to continue generation" },
      { status: 500 }
    );
  }
}


