import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { lookupAddress } from "@/lib/address-search";
import { getClientIp } from "@/lib/client-ip";
import { assertQueryAllowed, recordQuery } from "@/lib/query-access";
import type { GeoApiResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: "주소를 입력해주세요." },
      { status: 400 },
    );
  }

  try {
    const user = await getSessionUser();
    const clientIp = getClientIp(request.headers);
    const access = await assertQueryAllowed(user, clientIp);

    if (!access.allowed) {
      return NextResponse.json<GeoApiResponse>(
        { success: false, error: access.error },
        { status: 429 },
      );
    }

    const data = await lookupAddress(query);
    const recorded = await recordQuery({
      user,
      ip: clientIp,
      queryType: "address_search",
      queryValue: query,
      resultAddress: data.address,
    });

    return NextResponse.json({
      success: true,
      data,
      remaining: recorded.remaining ?? access.remaining,
      isMember: access.isMember,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "주소 검색에 실패했습니다.";
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
