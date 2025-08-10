import { NextRequest, NextResponse } from "next/server";
import { getAllDomainStatsAsync, getDomainEvolutionAsync } from "@/lib/domains";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');

    if (domain) {
      const evolution = await getDomainEvolutionAsync(domain);
      return NextResponse.json(evolution);
    } else {
      const stats = await getAllDomainStatsAsync();
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
