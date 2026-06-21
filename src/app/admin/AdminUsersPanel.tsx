"use client";

import { useEffect, useState } from "react";

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

export default function AdminUsersPanel({
  initialCount,
}: {
  initialCount: number;
}) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [dbCount, setDbCount] = useState(initialCount);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadUsers(refreshStats = false) {
    if (refreshStats) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error ?? "회원 목록 불러오기 실패");
      }
      setUsers(json.users);
      if (json.crowdStats?.count != null) {
        setDbCount(json.crowdStats.count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

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

  async function deleteUser(user: AdminUser) {
    const ok = window.confirm(
      `${user.email} 회원을 삭제할까요?\n조회 이력도 함께 삭제되며 되돌릴 수 없습니다.`,
    );
    if (!ok) return;

    setBusyId(user.id);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);

      setUsers((prev) => prev.filter((item) => item.id !== user.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = users.filter(
    (user) => !user.isApproved && user.role !== "ADMIN",
  ).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          API 기준 최신 DB 건수:{" "}
          <span className="font-semibold tabular-nums text-slate-800">
            {dbCount.toLocaleString("ko-KR")}
          </span>
          건
        </p>
        <button
          type="button"
          onClick={() => void loadUsers(true)}
          disabled={refreshing}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {refreshing ? "갱신 중..." : "DB·회원 새로고침"}
        </button>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">전체 회원</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{users.length}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">승인 대기</p>
          <p className="mt-1 text-2xl font-bold text-amber-900">{pendingCount}</p>
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
                        <div className="flex flex-wrap gap-2">
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
                          <button
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => void deleteUser(user)}
                            className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
