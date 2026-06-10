"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ToolPageLayout from "@/components/ToolPageLayout";

interface DnsResult {
  success: boolean;
  type?: "ip" | "domain";
  query?: string;
  hostnames?: string[];
  records?: {
    a: string[];
    aaaa: string[];
    mx: string[];
    ns: string[];
    cname: string[];
  };
  error?: string;
}

export default function DnsPage() {
  return (
    <Suspense
      fallback={
        <ToolPageLayout title="DNS 조회" description="로딩 중...">
          <p className="text-sm text-slate-500">로딩 중...</p>
        </ToolPageLayout>
      }
    >
      <DnsPageContent />
    </Suspense>
  );
}

function DnsPageContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DnsResult | null>(null);

  useEffect(() => {
    const ip = searchParams.get("ip");
    if (ip) {
      setQuery(ip);
      void runLookup(ip);
    }
  }, [searchParams]);

  async function runLookup(value: string) {
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`/api/dns?q=${encodeURIComponent(value)}`);
      const json = (await res.json()) as DnsResult;
      setResult(json);
    } catch {
      setResult({ success: false, error: "DNS 조회에 실패했습니다." });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (query.trim()) void runLookup(query.trim());
  }

  return (
    <ToolPageLayout
      title="DNS 조회"
      description="IP 주소의 역방향 DNS(PTR) 또는 도메인의 A/AAAA/MX/NS 레코드를 조회합니다."
      defaultIp={searchParams.get("ip") ?? undefined}
    >
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="IP 또는 도메인 (예: 8.8.8.8, google.com)"
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "DNS 조회"}
        </button>
      </form>

      {result && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {!result.success ? (
            <p className="text-sm text-red-600">{result.error}</p>
          ) : result.type === "ip" ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-500">IP 주소</dt>
                <dd className="font-semibold text-slate-900">{result.query}</dd>
              </div>
              <div>
                <dt className="font-medium text-slate-500">PTR (역방향 DNS)</dt>
                <dd className="font-semibold text-slate-900">
                  {result.hostnames?.length
                    ? result.hostnames.join(", ")
                    : "등록된 PTR 레코드 없음"}
                </dd>
              </div>
            </dl>
          ) : (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-slate-500">도메인</dt>
                <dd className="font-semibold text-slate-900">{result.query}</dd>
              </div>
              {(
                [
                  ["A", result.records?.a],
                  ["AAAA", result.records?.aaaa],
                  ["MX", result.records?.mx],
                  ["NS", result.records?.ns],
                  ["CNAME", result.records?.cname],
                ] as const
              ).map(([label, values]) => (
                <div key={label}>
                  <dt className="font-medium text-slate-500">{label}</dt>
                  <dd className="font-semibold text-slate-900">
                    {values?.length ? values.join(", ") : "-"}
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
