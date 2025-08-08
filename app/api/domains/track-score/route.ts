import { NextRequest, NextResponse } from "next/server";
import { getDomainsForFile, addDomainScoreAsync, ensureDomainsExist } from "@/lib/domains";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, filename, score, totalQuestions, answeredQuestions, averageScore } = body;

    if (!filename || score === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get domains for this file
    const domains = getDomainsForFile(filename);
    
    if (domains.length === 0) {
      console.log(`No domains found for file: ${filename}`);
      return NextResponse.json({ message: "No domains mapped for this file" });
    }

    // Ensure newly discovered domains exist in mapping (creates with generated colors)
    ensureDomainsExist(domains);

    // Add score for each domain this file belongs to (KV-safe)
    await Promise.all(domains.map((domain) => addDomainScoreAsync({
      domain,
      sessionId,
      filename,
      score,
      totalQuestions,
      answeredQuestions,
      averageScore,
    })));

    return NextResponse.json({ 
      message: "Domain scores tracked successfully",
      domains,
      score
    });

  } catch (error: any) {
    console.error("Error tracking domain score:", error);
    return NextResponse.json(
      { error: error.message || "Failed to track domain score" },
      { status: 500 }
    );
  }
}
