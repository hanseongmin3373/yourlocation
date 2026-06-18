import { NextRequest, NextResponse } from "next/server";
import { buildAutocompleteSuggestions } from "@/lib/autocomplete";
import { getClientIp } from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ success: true, suggestions: [] });
  }

  try {
    const clientIp = getClientIp(request.headers);
    const suggestions = await buildAutocompleteSuggestions(q, clientIp);
    return NextResponse.json({ success: true, suggestions });
  } catch {
    return NextResponse.json({ success: true, suggestions: [] });
  }
}
