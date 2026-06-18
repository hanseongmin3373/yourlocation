"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SiteFooterProps = {
  onReRegister?: () => void;
  onEraseData?: () => void;
  crowdStatsRefresh?: number;
};

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 1.5a4 4 0 0 0-4 4c0 2.75 4 8.5 4 8.5s4-5.75 4-8.5a4 4 0 0 0-4-4Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
    </svg>
  );
}

export default function SiteFooter({
  onReRegister,
  onEraseData,
  crowdStatsRefresh = 0,
}: SiteFooterProps) {
  const [crowdCount, setCrowdCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/crowd-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.success && typeof j.count === "number") setCrowdCount(j.count);
      })
      .catch(() => {});
  }, [crowdStatsRefresh]);

  return (
    <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
      <div className="mb-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link href="/legal/terms" className="hover:text-slate-600">
          이용약관
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/legal/privacy" className="hover:text-slate-600">
          개인정보 처리방침
        </Link>
        {onEraseData && (
          <>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={onEraseData}
              className="text-amber-700 hover:text-amber-900"
            >
              내 IP 등록 삭제
            </button>
          </>
        )}
      </div>
      <p>© {new Date().getFullYear()} yourlocation.co.kr · IP 위치 조회 서비스</p>

      {(crowdCount != null || onReRegister) && (
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2">
          {crowdCount != null && (
            <span className="text-[10px] tabular-nums leading-none text-slate-300">
              등록 {crowdCount.toLocaleString("ko-KR")}건
            </span>
          )}
          {crowdCount != null && onReRegister && (
            <span
              className="text-[10px] leading-none text-slate-200"
              aria-hidden="true"
            >
              ·
            </span>
          )}
          {onReRegister && (
            <button
              type="button"
              onClick={onReRegister}
              className="group inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-gradient-to-b from-white to-emerald-50/40 px-2.5 py-1 text-[10px] font-medium leading-none text-emerald-700 shadow-sm transition hover:border-emerald-300 hover:from-emerald-50 hover:to-emerald-100/60 hover:text-emerald-800 hover:shadow"
            >
              <PinIcon className="h-2.5 w-2.5 text-emerald-500 transition group-hover:text-emerald-600" />
              위치 등록/재등록
            </button>
          )}
        </div>
      )}
    </footer>
  );
}
