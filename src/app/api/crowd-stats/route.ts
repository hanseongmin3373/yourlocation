import { NextResponse } from "next/server";
import { getCrowdStats } from "@/lib/crowd-ip-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const stats = await getCrowdStats();
    return NextResponse.json({ success: true, ...stats });
  } catch {
    return NextResponse.json({
      success: true,
      count: 0,
      todayRegistered: 0,
    });
  }
}
