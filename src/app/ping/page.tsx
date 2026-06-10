"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ToolPageLayout from "@/components/ToolPageLayout";

interface PingResult {
  success: boolean;
  host?: string;
  reachable?: boolean;
  latencyMs?: number;
  port?: number;
  message?: string;
  attempts?: { port: number; latencyMs: number | null; status: string }[];
  error?: string;
}

export default function PingPage() {
  return (
    <Suspense
      fallback={
        <ToolPageLayout title="Ping 테스트" description="로딩 중...">
          <p className="text-sm text-slate-500">로딩 중...</p>
        </ToolPageLayout>
      }
    >
      <PingPageContent />
    </Suspense>
  );
}

function PingPageContent() {
  const searchParams = useSearchParams();
  const [host, setHost] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PingResult | null>(null);

  useEffect(() => {
    const ip = searchParams.get("ip");
    if (ip) {
      setHost(ip);
      void runPing(ip);
    }
  }, [searchParams]);

  async function runPing(value: string) {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/ping?host=${encodeURIComponent(value)}`);
      const json = (await res.json()) as PingResult;
      setResult(json);
    } catch {
      setResult({ success: false, error: "Ping 테스트에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (host.trim()) void runPing(host.trim());
  }

  return (
    <ToolPageLayout
      title="Ping 테스트"
      description="대상 IP의 TCP 연결 응답 시간을 측정합니다. (ICMP ping과 결과가 다를 수 있습니다)"
      defaultIp={searchParams.get("ip") ?? undefined}
    >
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="IP 주소 (예: 8.8.8.8)"
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="submit"
          disabled={loading || !host.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "테스트 중..." : "Ping 테스트"}
        </button>
      </form>

      {result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!result.success ? (
            <p className="text-sm text-red-600">{result.error}</p>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-500">대상 IP</dt>
                <dd className="font-semibold text-slate-900">{result.host}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">결과</dt>
                <dd
                  className={`font-semibold ${result.reachable ? "text-emerald-700" : "text-red-600"}`}
                >
                  {result.message}
                </dd>
              </div>
              {result.attempts?.map((attempt) => (
                <div key={attempt.port}>
                  <dt className="font-medium text-slate-500">
                    포트 {attempt.port}
                  </dt>
                  <dd className="font-semibold text-slate-900">
                    {attempt.latencyMs !== null
                      ? `${attempt.latencyMs}ms`
                      : "연결 실패"}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      )}
    </ToolPageLayout>
  );
}
