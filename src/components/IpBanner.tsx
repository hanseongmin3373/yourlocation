"use client";

import { useEffect, useState } from "react";

interface IpBannerProps {
  ip: string;
}

export default function IpBanner({ ip }: IpBannerProps) {
  const [crowdCount, setCrowdCount] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/crowd-stats", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j.success && typeof j.count === "number") setCrowdCount(j.count);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-800 sm:text-base">
        접속하신 외부 IP 주소는{" "}
        <strong className="text-lg font-bold text-emerald-800 sm:text-xl">
          {ip}
        </strong>{" "}
        입니다
      </p>
      <p className="text-xs text-slate-500">
        ip-api · 등록 DB · 카카오 주소 검색 (mylocation.co.kr 동일 방식)
        {crowdCount != null && crowdCount > 0
          ? ` · GPS 실측 ${crowdCount.toLocaleString("ko-KR")}건`
          : ""}
      </p>
    </div>
  );
}
