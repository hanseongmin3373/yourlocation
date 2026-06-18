"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: "USER" | "ADMIN";
  isApproved: boolean;
  createdAt: string;
  queryCount: number;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function AdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/users");
        const json = await res.json();
        if (!json.success) {
          if (res.status === 403) {
            router.replace("/");
            return;
          }
          throw new Error(json.error);
        }
        setUsers(json.users);
      } catch (err) {
        setError(err instanceof Error ? err.message : "불러오기 실패");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function toggleApproval(user: AdminUser) {
    setBusyId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          isApproved: !user.isApproved,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setUsers((prev) =>
        prev.map((item) =>
          item.id === user.id
            ? { ...item, isApproved: json.user.isApproved }
            : item,
        ),
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : "변경 실패");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = users.filter(
    (user) => !user.isApproved && user.role !== "ADMIN",
  ).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">관리자</h1>
            <p className="mt-1 text-sm text-slate-500">
              승인된 회원만 IP 조회 무제한 · 이력 저장
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            IP 조회
          </Link>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">전체 회원</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {users.length}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs text-amber-700">승인 대기</p>
            <p className="mt-1 text-2xl font-bold text-amber-900">
              {pendingCount}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs text-emerald-700">승인 완료</p>
            <p className="mt-1 text-2xl font-bold text-emerald-900">
              {users.filter((user) => user.isApproved).length}
            </p>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-slate-500">회원 목록을 불러오는 중...</p>
        )}

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        {!loading && users.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">가입일</th>
                    <th className="px-4 py-3">이메일</th>
                    <th className="px-4 py-3">이름</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">조회 수</th>
                    <th className="px-4 py-3">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {user.email}
                        {user.role === "ADMIN" && (
                          <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">
                            관리자
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {user.name || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {user.isApproved ? (
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                            승인됨
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                            대기
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {user.queryCount}
                      </td>
                      <td className="px-4 py-3">
                        {user.role === "ADMIN" ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : (
                          <button
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => toggleApproval(user)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                              user.isApproved
                                ? "border border-slate-200 text-slate-600 hover:bg-slate-50"
                                : "bg-blue-600 text-white hover:bg-blue-700"
                            }`}
                          >
                            {busyId === user.id
                              ? "처리 중..."
                              : user.isApproved
                                ? "승인 해제"
                                : "승인"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
