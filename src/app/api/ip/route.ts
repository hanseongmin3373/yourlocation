import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/geo";

export async function GET(request: NextRequest) {
  const ip = getClientIp(request.headers);

  return NextResponse.json({ ip });
}
