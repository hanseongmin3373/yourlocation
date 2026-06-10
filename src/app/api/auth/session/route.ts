import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getAnonymousRemaining } from "@/lib/query-access";
import { getClientIp } from "@/lib/geo";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();
    const ip = getClientIp(request.headers);
    const remaining = user ? null : await getAnonymousRemaining(ip);

    return NextResponse.json({
      success: true,
      user,
      remaining,
      isMember: !!user,
    });
  } catch (error) {
    console.error("session error", error);
    return NextResponse.json(
      { success: false, error: "세션 확인에 실패했습니다." },
      { status: 500 },
    );
  }
}
