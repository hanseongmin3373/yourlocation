import { NextResponse } from "next/server";
import { getSessionUser, isUnlimitedUser } from "@/lib/auth";
import {
  ANON_DAILY_LIMIT,
  getAnonymousRemaining,
  isPublicQueryUnlimited,
} from "@/lib/query-access";
import { getClientIp } from "@/lib/client-ip";

export async function GET(request: Request) {
  try {
    const user = await getSessionUser();

    if (isPublicQueryUnlimited()) {
      return NextResponse.json({
        success: true,
        isMember: Boolean(user && isUnlimitedUser(user)),
        isPendingMember: false,
        remaining: null,
        limit: null,
        unlimited: true,
      });
    }

    if (user && isUnlimitedUser(user)) {
      return NextResponse.json({
        success: true,
        isMember: true,
        isPendingMember: false,
        remaining: null,
        limit: null,
      });
    }

    const ip = getClientIp(request.headers);
    const remaining = await getAnonymousRemaining(ip);

    return NextResponse.json({
      success: true,
      isMember: false,
      isPendingMember: !!user,
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
