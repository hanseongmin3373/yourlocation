"use client";

interface IpBannerProps {
  ip: string;
}

export default function IpBanner({ ip }: IpBannerProps) {
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
        ip-api · 등록 DB · 카카오 주소 검색
      </p>
    </div>
  );
}
