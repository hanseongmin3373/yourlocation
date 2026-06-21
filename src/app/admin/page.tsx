import { requireAdmin } from "@/lib/auth";
import { getCrowdStats } from "@/lib/crowd-ip-db";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import AdminUsersPanel from "./AdminUsersPanel";
import Link from "next/link";

export const dynamic = "force-dynamic";

const SOURCE_LABELS: Record<string, string> = {
  "admin-verified": "관리자 검증",
  "user-verified": "사용자 검증",
  "mylocation-import": "bulk import",
  "gps-register": "GPS 등록",
  "lookup-absorb": "자동 적재",
};

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <Header />
        <main className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
          <h1 className="text-xl font-bold text-slate-900">관리자 전용</h1>
          <p className="mt-3 text-sm text-slate-600">
            관리자 계정으로 로그인하면 IP DB 건수와 회원 승인을 확인할 수
            있습니다.
          </p>
          <Link
            href="/auth/login?next=/admin"
            className="mt-6 inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            로그인
          </Link>
        </main>
        <SiteFooter />
      </div>
    );
  }

  let crowdStats = {
    count: 0,
    todayRegistered: 0,
    verifiedCount: 0,
    bySource: [] as { source: string; count: number }[],
  };
  let statsError: string | null = null;

  try {
    crowdStats = await getCrowdStats();
  } catch (error) {
    console.error("admin getCrowdStats error", error);
    statsError = "DB 통계 조회에 실패했습니다. DATABASE_URL을 확인해주세요.";
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">관리자</h1>
            <p className="mt-1 text-sm text-slate-500">
              {admin.email} · 승인된 회원 IP 조회 무제한
            </p>
            <p className="mt-2 text-sm font-medium text-blue-800">
              등록 IP DB{" "}
              <span className="text-2xl font-bold tabular-nums">
                {crowdStats.count.toLocaleString("ko-KR")}
              </span>
              건
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            IP 조회
          </Link>
        </div>

        <section
          className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          aria-labelledby="crowd-db-stats-title"
        >
          <h2
            id="crowd-db-stats-title"
            className="text-sm font-semibold text-slate-900"
          >
            위치 DB (관리자 전용)
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            공개 페이지에는 표시되지 않습니다.
          </p>

          {statsError ? (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {statsError}
            </p>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                  <p className="text-xs text-blue-700">등록 IP 총건</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-blue-950">
                    {crowdStats.count.toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                  <p className="text-xs text-violet-700">주소 확인(verified)</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-violet-950">
                    {crowdStats.verifiedCount.toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                  <p className="text-xs text-teal-700">오늘 갱신</p>
                  <p className="mt-1 text-3xl font-bold tabular-nums text-teal-950">
                    {crowdStats.todayRegistered.toLocaleString("ko-KR")}
                  </p>
                </div>
              </div>
              {crowdStats.bySource.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
                  {crowdStats.bySource.map((row) => (
                    <li
                      key={row.source}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 tabular-nums"
                    >
                      {SOURCE_LABELS[row.source] ?? row.source}{" "}
                      <span className="font-semibold text-slate-800">
                        {row.count.toLocaleString("ko-KR")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <AdminUsersPanel initialCount={crowdStats.count} />
      </main>

      <SiteFooter />
    </div>
  );
}
