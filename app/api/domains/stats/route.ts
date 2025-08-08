import { NextRequest, NextResponse } from "next/server";
import { getAllDomainStats, getDomainEvolution } from "@/lib/domains";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (domain) {
      // Get specific domain evolution
      const evolution = getDomainEvolution(domain);
      return NextResponse.json(evolution);
    } else {
      // Get all domain stats
      const stats = getAllDomainStats();
      return NextResponse.json({ stats });
    }

  } catch (error: any) {
    console.error("Error getting domain stats:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get domain stats" },
      { status: 500 }
    );
  }
}
