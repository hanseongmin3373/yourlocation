import { NextRequest, NextResponse } from "next/server";
import {
  collectHeaderIpsForApi,
  getClientIp,
  getPreferredClientIp,
  isIpv4,
  isPrivateIp,
} from "@/lib/client-ip";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const headers = request.headers;
  const ip = getClientIp(headers);
  const preferred = getPreferredClientIp(headers);
  const candidates = collectHeaderIpsForApi(headers);
  const ipv4 =
    candidates.find((c) => !isPrivateIp(c) && isIpv4(c)) ??
    candidates.find((c) => isIpv4(c)) ??
    null;

  return NextResponse.json(
    {
      ip: preferred || ip,
      ipv4,
      ipv6: candidates.find((c) => c.includes(":")) ?? null,
      serverIp: ip,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    },
  );
}
/** 브라우저에서 직접 확인한 IP와 서버 IP 비교용 (디버그) */
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { clientDetectedIp?: string };
  const serverIp = getClientIp(request.headers);
  const clientDetectedIp = body.clientDetectedIp?.trim() || null;

  const resolved = getPreferredClientIp(request.headers) || serverIp;

  return NextResponse.json(
    { ip: resolved, serverIp, clientDetectedIp },
    { headers: { "Cache-Control": "no-store" } },
  );
}
