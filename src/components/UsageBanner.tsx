"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function UsageBanner() {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [limit, setLimit] = useState(10);

  function loadUsage() {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setIsMember(json.isMember);
          setRemaining(json.remaining);
          if (json.limit) setLimit(json.limit);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadUsage();

    function onUsageUpdated(e: Event) {
      const detail = (e as CustomEvent<{ remaining: number }>).detail;
      if (typeof detail?.remaining === "number") {
        setRemaining(detail.remaining);
        setIsMember(false);
      }
    }

    window.addEventListener("usage-updated", onUsageUpdated);
    return () => window.removeEventListener("usage-updated", onUsageUpdated);
  }, []);

  if (isMember) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        회원 로그인 중 · IP 조회 <strong>무제한</strong> ·{" "}
        <Link href="/my" className="font-semibold underline hover:no-underline">
          조회 이력 보기
        </Link>
      </div>
    );
  }

  if (remaining === null) return null;

  const low = remaining <= 3;

  return (
    <div
      className={`rounded-xl border px-4 py-2.5 text-sm ${
        low
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-700"
      }`}
    >
      비회원 오늘 남은 조회:{" "}
      <strong>
        {remaining}/{limit}회
      </strong>
      {low && " · 한도가 거의 소진되었습니다."}{" "}
      <Link
        href="/auth/signup"
        className="font-semibold text-blue-600 hover:underline"
      >
        회원가입
      </Link>
      하면 무제한 + 이력 저장
    </div>
  );
}

export function updateUsageFromResponse(remaining: number | null | undefined) {
  if (typeof remaining === "number") {
    window.dispatchEvent(
      new CustomEvent("usage-updated", { detail: { remaining } }),
    );
  }
}
