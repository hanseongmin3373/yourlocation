import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { ANON_DAILY_LIMIT, getAnonymousRemaining } from "@/lib/query-access";
import { getClientIp } from "@/lib/geo";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    if (user) {
      return NextResponse.json({
        success: true,
        isMember: true,
        remaining: null,
        limit: null,
      });
    }

    const ip = getClientIp(request.headers);
    const remaining = await getAnonymousRemaining(ip);

    return NextResponse.json({
      success: true,
      isMember: false,
      remaining,
      limit: ANON_DAILY_LIMIT,
    });
  } catch (error) {
    console.error("usage error", error);
    return NextResponse.json(
      { success: false, error: "조회 한도 확인에 실패했습니다." },
      { status: 500 },
    );
  }
}
