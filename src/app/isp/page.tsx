"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import ToolPageLayout from "@/components/ToolPageLayout";
import type { GeoLocationData } from "@/lib/types";

export default function IspPage() {
  return (
    <Suspense
      fallback={
        <ToolPageLayout title="ISP/호스팅 조회" description="로딩 중...">
          <p className="text-sm text-slate-500">로딩 중...</p>
        </ToolPageLayout>
      }
    >
      <IspPageContent />
    </Suspense>
  );
}

function IspPageContent() {
  const searchParams = useSearchParams();
  const [ip, setIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<GeoLocationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialIp = searchParams.get("ip");
    if (initialIp) {
      setIp(initialIp);
      void runLookup(initialIp);
    }
  }, [searchParams]);

  async function runLookup(value: string) {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/geolocation?ip=${encodeURIComponent(value)}`,
      );
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "조회에 실패했습니다.");
      }

      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (ip.trim()) void runLookup(ip.trim());
  }

  return (
    <ToolPageLayout
      title="ISP/호스팅 조회"
      description="IP 주소의 ISP, 조직(AS), 호스팅 정보를 조회합니다."
      defaultIp={searchParams.get("ip") ?? undefined}
    >
      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-2 sm:flex-row"
      >
        <input
          type="text"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="IP 주소 (예: 8.8.8.8)"
          className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        />
        <button
          type="submit"
          disabled={loading || !ip.trim()}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "조회 중..." : "ISP 조회"}
        </button>
      </form>

      {error && (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {data && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <dl className="space-y-3 text-sm">
            {(
              [
                ["IP 주소", data.ip],
                ["ISP", data.isp],
                ["조직", data.org],
                ["AS", data.as],
                ["국가", `${data.country} (${data.countryCode})`],
                ["지역", data.region],
                ["도시", data.city],
                ["주소", data.address],
              ] as const
            ).map(([label, value]) => (
              <div
                key={label}
                className="flex flex-col gap-0.5 sm:flex-row sm:justify-between"
              >
                <dt className="font-medium text-slate-500">{label}</dt>
                <dd className="font-semibold text-slate-900 sm:text-right">
                  {value || "-"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </ToolPageLayout>
  );
}
