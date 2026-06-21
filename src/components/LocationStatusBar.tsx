"use client";

import type { GeoLocationData } from "@/lib/types";

type LocationStatusBarProps = {
  data: GeoLocationData | null;
  resolvedVia?: "gps" | "ip";
  gpsFailed?: boolean;
};

function formatRadiusM(m: number): string {
  return m >= 1000
    ? `±${(m / 1000).toFixed(1)}km`
    : `±${Math.round(m)}m`;
}

export default function LocationStatusBar({
  data,
  resolvedVia,
  gpsFailed,
}: LocationStatusBarProps) {
  if (!data) return null;

  const via = resolvedVia ?? data.resolvedVia;
  const isVpn =
    data.isVpn ||
    data.isProxy ||
    data.isTor ||
    Boolean(data.privacyServiceName);
  const showRadius =
    data.accuracyM != null &&
    data.accuracyM > 0 &&
    !data.userVerified;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {via === "gps" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
          <span aria-hidden>📍</span>
          GPS 위치
        </span>
      )}
      {via === "ip" && (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-900">
          <span aria-hidden>🌐</span>
          IPinfo 추정
        </span>
      )}
      {gpsFailed && (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900">
          GPS 거부/실패 → IP fallback
        </span>
      )}
      {showRadius && (
        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            data.accuracyTier === "high"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : data.accuracyTier === "normal"
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-slate-200 bg-slate-50 text-slate-700"
          }`}
        >
          정확도 반경 {formatRadiusM(data.accuracyM!)}
          {data.accuracyTier === "high" && " · 동급"}
        </span>
      )}
      {isVpn && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-800">
          <span aria-hidden>🛡</span>
          VPN
          {data.privacyServiceName ? ` · ${data.privacyServiceName}` : ""}
        </span>
      )}
      {data.isHosting && !isVpn && (
        <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-semibold text-orange-900">
          호스팅/DC IP
        </span>
      )}
    </div>
  );
}
