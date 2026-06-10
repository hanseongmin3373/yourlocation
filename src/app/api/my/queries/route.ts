import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getUserQueryLogs } from "@/lib/query-access";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    const queries = await getUserQueryLogs(user.id);

    return NextResponse.json({
      success: true,
      user: { email: user.email, name: user.name },
      queries,
      total: queries.length,
    });
  } catch (error) {
    console.error("my queries error", error);
    return NextResponse.json(
      { success: false, error: "조회 이력을 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
