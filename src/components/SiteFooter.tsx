"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SiteFooterProps = {
  onEraseData?: () => void;
  crowdStatsRefresh?: number;
};

export default function SiteFooter({
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
      {crowdCount != null && (
        <p className="mt-1 text-[10px] leading-none text-slate-300">
          등록 {crowdCount.toLocaleString("ko-KR")}건
        </p>
      )}
    </footer>
  );
}
