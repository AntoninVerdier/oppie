import { NextResponse } from "next/server";

export async function GET() {
  const model = process.env.OPENAI_QCM_MODEL || "Not set";
  return NextResponse.json({ model });
}
