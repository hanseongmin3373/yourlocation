import dns from "node:dns/promises";
import { NextRequest, NextResponse } from "next/server";

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

function isIp(value: string) {
  return IP_REGEX.test(value);
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim();

  if (!query) {
    return NextResponse.json(
      { success: false, error: "IP 또는 도메인을 입력해주세요." },
      { status: 400 },
    );
  }

  try {
    if (isIp(query)) {
      const hostnames = await dns.reverse(query).catch(() => [] as string[]);
      return NextResponse.json({
        success: true,
        type: "ip",
        query,
        hostnames,
      });
    }

    const [aRecords, aaaaRecords, mxRecords, nsRecords, cnameRecords] =
      await Promise.all([
        dns.resolve4(query).catch(() => [] as string[]),
        dns.resolve6(query).catch(() => [] as string[]),
        dns.resolveMx(query).catch(() => [] as { exchange: string; priority: number }[]),
        dns.resolveNs(query).catch(() => [] as string[]),
        dns.resolveCname(query).catch(() => [] as string[]),
      ]);

    return NextResponse.json({
      success: true,
      type: "domain",
      query,
      records: {
        a: aRecords,
        aaaa: aaaaRecords,
        mx: mxRecords.map((r) => `${r.priority} ${r.exchange}`),
        ns: nsRecords,
        cname: cnameRecords,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "DNS 조회에 실패했습니다." },
      { status: 500 },
    );
  }
}
