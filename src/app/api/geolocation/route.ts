import { NextRequest, NextResponse } from "next/server";
import { isValidIp, lookupIp } from "@/lib/geo";
import type { GeoApiResponse } from "@/lib/types";

export async function GET(request: NextRequest) {
  const ip = request.nextUrl.searchParams.get("ip");

  if (!ip) {
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: "IP 주소를 입력해주세요." },
      { status: 400 },
    );
  }

  const trimmedIp = ip.trim();

  if (!isValidIp(trimmedIp)) {
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: "올바른 IP 주소 형식이 아닙니다." },
      { status: 400 },
    );
  }

  try {
    const data = await lookupIp(trimmedIp);
    return NextResponse.json<GeoApiResponse>({ success: true, data });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "IP 조회에 실패했습니다.";
    return NextResponse.json<GeoApiResponse>(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
