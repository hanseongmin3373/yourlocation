import net from "node:net";
import { NextRequest, NextResponse } from "next/server";

const IP_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

function tcpPing(host: string, port: number, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = net.connect({ host, port, timeout: timeoutMs });

    socket.once("connect", () => {
      resolve(Date.now() - start);
      socket.destroy();
    });

    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });

    socket.once("error", reject);
  });
}

export async function GET(request: NextRequest) {
  const host = request.nextUrl.searchParams.get("host")?.trim();

  if (!host || !IP_REGEX.test(host)) {
    return NextResponse.json(
      { success: false, error: "유효한 IP 주소를 입력해주세요." },
      { status: 400 },
    );
  }

  const ports = [443, 80];
  const attempts: { port: number; latencyMs: number | null; status: string }[] =
    [];

  for (const port of ports) {
    try {
      const latencyMs = await tcpPing(host, port);
      attempts.push({ port, latencyMs, status: "success" });
    } catch {
      attempts.push({ port, latencyMs: null, status: "timeout" });
    }
  }

  const successful = attempts.filter((a) => a.latencyMs !== null);

  if (successful.length === 0) {
    return NextResponse.json({
      success: true,
      host,
      reachable: false,
      attempts,
      message: "대상 IP에 연결할 수 없습니다.",
    });
  }

  const best = successful.reduce((min, cur) =>
    (cur.latencyMs ?? Infinity) < (min.latencyMs ?? Infinity) ? cur : min,
  );

  return NextResponse.json({
    success: true,
    host,
    reachable: true,
    latencyMs: best.latencyMs,
    port: best.port,
    attempts,
    message: `TCP 연결 응답 시간 ${best.latencyMs}ms (포트 ${best.port})`,
  });
}
