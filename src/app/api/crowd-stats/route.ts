import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getCrowdStats } from "@/lib/crowd-ip-db";

export const dynamic = "force-dynamic";

/** 공개 노출 금지 — 관리자만 DB 규모 조회 */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  try {
    const stats = await getCrowdStats();
    return NextResponse.json({ success: true, ...stats });
  } catch {
    return NextResponse.json({
      success: true,
      count: 0,
      todayRegistered: 0,
      verifiedCount: 0,
      bySource: [],
    });
  }
}
