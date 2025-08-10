import { NextRequest, NextResponse } from "next/server";
import { readSessionFile } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("id") || searchParams.get("sid") || searchParams.get("sessionId");
    const index = parseInt(searchParams.get("index") || "0");

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    // Read session file
    const sessionData = await readSessionFile(sessionId);
    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const { questions, available, total, status } = sessionData;

    if (!questions || !Array.isArray(questions)) {
      return NextResponse.json({ error: "No questions found" }, { status: 404 });
    }

    if (index >= questions.length) {
      return NextResponse.json({ error: "Question index out of range" }, { status: 404 });
    }

    const question = questions[index];
    if (!question) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    return NextResponse.json({
      question,
      available,
      total,
      status,
      index
    });

  } catch (error: any) {
    console.error("Error in generate/get:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


