"use client";

import { useEffect, useState } from "react";

type CrowdDbBannerProps = {
  onRegisterClick?: () => void;
  refreshKey?: number;
};

export default function CrowdDbBanner({
  onRegisterClick,
  refreshKey = 0,
}: CrowdDbBannerProps) {
  const [count, setCount] = useState<number | null>(null);
  const [today, setToday] = useState(0);

  useEffect(() => {
    fetch("/api/crowd-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.success) {
          if (typeof j.count === "number") setCount(j.count);
          if (typeof j.todayRegistered === "number") setToday(j.todayRegistered);
        }
      })
      .catch(() => {});
  }, [refreshKey]);

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
      <p className="text-center text-sm text-emerald-950">
        현재 총{" "}
        <strong className="text-lg font-bold text-emerald-800">
          {count != null ? count.toLocaleString("ko-KR") : "—"}
        </strong>{" "}
        개의 사용자 위치 데이터가 등록되었습니다.
        {today > 0 && (
          <span className="ml-1 text-xs text-emerald-700">
            (오늘 +{today.toLocaleString("ko-KR")})
          </span>
        )}
      </p>
      <p className="mt-1 text-center text-xs text-emerald-800/80">
        GPS 허용 시 IP+좌표가 DB에 저장되어 전체 정확도가 올라갑니다.
        {onRegisterClick && (
          <>
            {" "}
            <button
              type="button"
              onClick={onRegisterClick}
              className="font-semibold underline hover:text-emerald-950"
            >
              위치 등록/재등록
            </button>
          </>
        )}
      </p>
    </div>
  );
}
