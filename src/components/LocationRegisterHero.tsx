"use client";

import { useEffect, useState } from "react";

type LocationRegisterHeroProps = {
  isRegistered: boolean;
  clientIp?: string;
  onRegister: () => void;
  crowdStatsRefresh?: number;
};

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 21s7-4.5 7-10a7 7 0 1 0-14 0c0 5.5 7 10 7 10Z"
      />
      <circle cx="12" cy="11" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function LocationRegisterHero({
  isRegistered,
  clientIp,
  onRegister,
  crowdStatsRefresh = 0,
}: LocationRegisterHeroProps) {
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
    <section
      aria-labelledby="location-register-hero-title"
      className={
        isRegistered
          ? "border-b border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-teal-50/60"
          : "border-b border-emerald-300 bg-gradient-to-br from-emerald-100 via-emerald-50 to-teal-50"
      }
    >
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            {isRegistered ? (
              <>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-semibold text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  GPS 등록 완료
                </p>
                <h2
                  id="location-register-hero-title"
                  className="text-xl font-bold tracking-tight text-emerald-950 sm:text-2xl"
                >
                  내 IP 위치가 정밀 모드로 표시됩니다
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-emerald-900/85 sm:text-base">
                  GPS 실측·등록 DB를 우선 적용합니다. 이사·통신사 변경 등
                  주소가 달라졌다면 <strong>재등록</strong>해 주세요.
                </p>
              </>
            ) : (
              <>
                <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-900">
                  1단계 · 필수
                </p>
                <h2
                  id="location-register-hero-title"
                  className="text-2xl font-bold tracking-tight text-emerald-950 sm:text-3xl"
                >
                  GPS로 내 위치를 등록해 주세요
                </h2>
                <p className="max-w-2xl text-sm leading-relaxed text-emerald-900 sm:text-base">
                  IP만으로는 도로명까지 <strong>절대 정확할 수 없습니다</strong>.
                  {" "}
                  <strong>GPS 허용 → 주소 확인 → 등록</strong>하면 본인 IP
                  위치가 <strong>오차 없이</strong> 표시됩니다.
                </p>
                <ul className="grid gap-1.5 text-sm text-emerald-800/90 sm:grid-cols-2">
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-emerald-600">✓</span>
                    IP+좌표가 DB에 저장되어 전체 정확도 향상
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-emerald-600">✓</span>
                    도로명·지번 직접 확인
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-emerald-600">✓</span>
                    등록 후 IP·주소·좌표 검색 가능
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-0.5 font-bold text-emerald-600">✓</span>
                    조회 한도 차감 없음 (등록만)
                  </li>
                </ul>
              </>
            )}

            {clientIp && (
              <p className="text-xs text-emerald-700/70">
                접속 IP{" "}
                <span className="font-mono font-semibold text-emerald-900">
                  {clientIp}
                </span>
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-stretch gap-3 sm:items-center lg:items-end">
            <button
              type="button"
              onClick={onRegister}
              className={
                isRegistered
                  ? "inline-flex items-center justify-center gap-2.5 rounded-2xl border-2 border-emerald-600 bg-white px-8 py-4 text-base font-bold text-emerald-800 shadow-md transition hover:bg-emerald-50 hover:shadow-lg sm:min-w-[220px]"
                  : "inline-flex items-center justify-center gap-2.5 rounded-2xl bg-emerald-600 px-10 py-5 text-lg font-bold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 hover:shadow-xl hover:shadow-emerald-600/30 sm:min-w-[240px]"
              }
            >
              <PinIcon
                className={
                  isRegistered ? "h-6 w-6 text-emerald-600" : "h-7 w-7"
                }
              />
              {isRegistered ? "위치 재등록" : "위치 등록하기"}
            </button>
            {!isRegistered && (
              <p className="text-center text-xs text-emerald-800/70 lg:text-right">
                버튼을 누르면 GPS 권한 요청이 시작됩니다
              </p>
            )}
          </div>
        </div>

        {crowdCount != null && (
          <p className="mt-4 text-center text-[11px] tabular-nums text-emerald-700/60 lg:text-left">
            등록된 위치 데이터 {crowdCount.toLocaleString("ko-KR")}건 · 함께
            모을수록 정확도가 올라갑니다
          </p>
        )}
      </div>
    </section>
  );
}
