"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";

interface QueryItem {
  id: string;
  queryType: string;
  queryValue: string;
  resultAddress: string | null;
  createdAt: string;
}

interface MyData {
  user: { email: string; name: string | null };
  queries: QueryItem[];
  total: number;
}

function formatType(type: string) {
  if (type === "gps_lookup") return "GPS 위치";
  return "IP 조회";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function MyPage() {
  const router = useRouter();
  const [data, setData] = useState<MyData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/my/queries")
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          if (json.error?.includes("로그인")) {
            router.replace("/auth/login");
            return;
          }
          throw new Error(json.error);
        }
        setData(json);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "불러오기 실패");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">내 조회 이력</h1>
            {data && (
              <p className="mt-1 text-sm text-slate-500">
                {data.user.name || data.user.email} · 총 {data.total}건
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href="/"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              IP 조회
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
            >
              로그아웃
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-slate-500">이력을 불러오는 중...</p>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {data && data.queries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            아직 저장된 조회 이력이 없습니다.{" "}
            <Link href="/" className="text-blue-600 hover:underline">
              IP 조회하기
            </Link>
          </div>
        )}

        {data && data.queries.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">일시</th>
                    <th className="px-4 py-3">유형</th>
                    <th className="px-4 py-3">조회값</th>
                    <th className="px-4 py-3">결과 주소</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.queries.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(item.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {formatType(item.queryType)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">
                        {item.queryValue}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {item.resultAddress || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
