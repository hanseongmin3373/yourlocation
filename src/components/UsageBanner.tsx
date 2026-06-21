"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function UsageBanner() {
  const [unlimited, setUnlimited] = useState(true);
  const [isMember, setIsMember] = useState(false);

  function loadUsage() {
    fetch("/api/usage")
      .then((r) => r.json())
      .then((json) => {
        if (json.success) {
          setUnlimited(json.unlimited === true || json.remaining === null);
          setIsMember(json.isMember);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    loadUsage();
  }, []);

  if (unlimited && !isMember) {
    return null;
  }

  if (isMember) {
    return (
      <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        로그인 · 조회 이력 저장 ·{" "}
        <Link href="/my" className="font-semibold underline hover:no-underline">
          내 조회 이력
        </Link>
      </div>
    );
  }

  return null;
}

export function updateUsageFromResponse(_remaining: number | null | undefined) {
  /* 공개 무제한 모드 — 배너 갱신 불필요 */
}
