import {
  ACCURACY_EXCEEDED_NOTE,
  isPreciseLocation,
  MAX_ALLOWED_ACCURACY_M,
} from "@/lib/geo-accuracy";
import type { GeoLocationData, PoliceStationInfo } from "@/lib/types";

interface LocationInfoProps {
  data: GeoLocationData | null;
  loading?: boolean;
  title?: string;
  showPolice?: boolean;
  policeStation?: PoliceStationInfo | null;
  policeLoading?: boolean;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <dt className="shrink-0 text-sm font-medium text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900 sm:text-right">
        {value || "-"}
      </dd>
    </div>
  );
}

function confidenceLabel(level?: GeoLocationData["confidenceLevel"]): string {
  if (level === "high") return "높음";
  if (level === "medium") return "보통";
  if (level === "low") return "낮음";
  return "-";
}

function confidenceColor(level?: GeoLocationData["confidenceLevel"]): string {
  if (level === "high") return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (level === "medium") return "text-amber-800 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-50 border-slate-200";
}

function networkFlagLabel(flags?: string[]): string {
  if (!flags?.length) return "-";
  const map: Record<string, string> = {
    vpn: "VPN",
    proxy: "프록시",
    tor: "Tor",
    relay: "릴레이",
    hosting: "호스팅/DC",
    anycast: "Anycast",
    mobile: "모바일",
    satellite: "위성",
  };
  return flags.map((f) => map[f] || f).join(", ");
}

function asTypeLabel(t?: string): string {
  if (!t) return "-";
  const map: Record<string, string> = {
    isp: "ISP",
    hosting: "호스팅",
    education: "교육",
    government: "정부",
    business: "기업",
  };
  return map[t] || t;
}

export default function LocationInfo({
  data,
  loading,
  title = "위치 정보",
  showPolice = false,
  policeStation,
  policeLoading = false,
}: LocationInfoProps) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">
          IP 주소를 검색하거나 현재 위치를 확인해보세요.
        </p>
      </section>
    );
  }

  const precise = isPreciseLocation(data);
  const lowAccuracy =
    data.accuracyM != null && data.accuracyM > MAX_ALLOWED_ACCURACY_M;
  const isVpn =
    data.isVpn ||
    data.isProxy ||
    data.isTor ||
    Boolean(data.privacyServiceName);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {data.expertMode && (
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              precise
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : data.resolvedVia === "gps"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            {data.locationSource === "gps" || data.resolvedVia === "gps"
              ? "GPS"
              : precise
                ? "좌표 고정"
                : "IP 추정"}
          </span>
        )}
      </div>

      {isVpn && (
        <div
          role="alert"
          className="mb-4 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
        >
          <p className="font-bold">
            VPN / 프록시 감지
            {data.privacyServiceName ? ` — ${data.privacyServiceName}` : ""}
          </p>
          <p className="mt-1 text-xs text-red-800">
            IPinfo 기준 익명 네트워크입니다. 표시 위치는 VPN 출구 또는 ISP
            추정일 수 있으며 실제 거주지와 다를 수 있습니다.
            {data.resolvedVia === "gps" &&
              " 좌표는 브라우저 GPS를 우선 표시합니다."}
          </p>
        </div>
      )}

      {data.accuracyM != null && data.accuracyM > 0 && !precise && (
        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
          <p className="font-semibold">
            정확도 반경{" "}
            {data.accuracyM >= 1000
              ? `±${(data.accuracyM / 1000).toFixed(1)}km`
              : `±${Math.round(data.accuracyM)}m`}
            {data.accuracyTier === "high" && " (고신뢰 · 행정동급)"}
            {data.accuracyTier === "normal" && " (시·군·구급)"}
          </p>
          <p className="mt-1 text-xs text-blue-800">
            지도 파란/초록 원 안이 추정 가능 범위입니다.
            {data.resolvedVia === "gps"
              ? " GPS 허용 시 브라우저 좌표 기준입니다."
              : " IPinfo·GeoIP 융합 추정입니다."}
          </p>
        </div>
      )}

      {lowAccuracy && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">{ACCURACY_EXCEEDED_NOTE}</span>
          {data.accuracyM != null && (
            <span className="mt-1 block text-xs text-amber-800">
              추정 오차 약 {(data.accuracyM / 1000).toFixed(1)}km
            </span>
          )}
        </div>
      )}

      {data.precisionScore != null && !precise && data.locationSource === "ip" && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 ${confidenceColor(data.confidenceLevel)}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold">
              정밀도 {data.precisionScore}%
            </span>
            <span className="text-xs">
              신뢰도 {confidenceLabel(data.confidenceLevel)}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/60">
            <div
              className="h-full rounded-full bg-current opacity-60 transition-all"
              style={{ width: `${data.precisionScore}%` }}
            />
          </div>
        </div>
      )}

      <dl className="space-y-3">
        <InfoRow label="IP 주소" value={data.ip} />
        <InfoRow
          label={precise ? "도로명 주소" : "행정 구역"}
          value={data.address}
        />
        {data.legalAddress && (
          <InfoRow label="지번 주소" value={data.legalAddress} />
        )}
        {data.dong && <InfoRow label="행정동" value={data.dong} />}
        {data.sido && <InfoRow label="시·도" value={data.sido} />}
        {data.sigungu && <InfoRow label="시·군·구" value={data.sigungu} />}
        <InfoRow
          label="좌표 방식"
          value={
            precise
              ? "주소·GPS 단일 좌표 (오차 원 없음)"
              : `IP 추정${
                  data.accuracyM != null
                    ? ` · ±${
                        data.accuracyM >= 1000
                          ? `${(data.accuracyM / 1000).toFixed(1)}km`
                          : `${Math.round(data.accuracyM)}m`
                      }`
                    : ""
                }`
          }
        />
        {data.geoSources && data.geoSources.length > 0 && (
          <InfoRow label="융합 DB" value={data.geoSources.join(" + ")} />
        )}
        {data.ipinfoPlus && (
          <>
            <InfoRow
              label="ipinfo Plus"
              value={
                data.ipinfoRadiusKm != null
                  ? `반경 ±${data.ipinfoRadiusKm}km${
                      data.geoTrustScore != null
                        ? ` · 신뢰 ${data.geoTrustScore}%`
                        : ""
                    }`
                  : "활성"
              }
            />
            {data.networkFlags && data.networkFlags.length > 0 && (
              <InfoRow
                label="네트워크 유형"
                value={networkFlagLabel(data.networkFlags)}
              />
            )}
            {data.mobileCarrier && (
              <InfoRow
                label="이동통신사"
                value={`${data.mobileCarrier}${
                  data.mobileMcc ? ` (MCC ${data.mobileMcc}` : ""
                }${data.mobileMnc ? ` MNC ${data.mobileMnc})` : data.mobileMcc ? ")" : ""}`}
              />
            )}
            {data.privacyServiceName && (
              <InfoRow label="익명 서비스" value={data.privacyServiceName} />
            )}
            {data.asType && (
              <InfoRow label="ASN 유형" value={asTypeLabel(data.asType)} />
            )}
            {data.hostname && (
              <InfoRow label="호스트명" value={data.hostname} />
            )}
            {(data.geoLastChanged || data.asLastChanged) && (
              <InfoRow
                label="변경 이력"
                value={[
                  data.geoLastChanged && `위치 ${data.geoLastChanged}`,
                  data.asLastChanged && `ASN ${data.asLastChanged}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            )}
          </>
        )}
        {data.addressSource && data.locationSource === "ip" && (
          <InfoRow label="주소 출처" value={data.addressSource} />
        )}
        {data.locationSource === "gps" && (
          <InfoRow label="위치 방식" value="GPS" />
        )}
        <InfoRow
          label="위도 / 경도"
          value={`${data.lat.toFixed(7)}, ${data.lon.toFixed(7)}`}
        />
        <InfoRow label="국가" value={`${data.country} (${data.countryCode})`} />
        <InfoRow label="지역" value={data.region} />
        <InfoRow label="도시" value={data.city} />
        <InfoRow label="우편번호" value={data.zip} />
        <InfoRow label="시간대" value={data.timezone} />
        <InfoRow label="ISP" value={data.isp} />
        <InfoRow label="조직" value={data.org} />
      </dl>

      {data.accuracyNote &&
        (data.locationSource === "ip" || data.locationSource === "crowd") && (
          <p
            className={`mt-4 rounded-xl border px-4 py-3 text-xs leading-relaxed ${
              data.isVpn || data.privacyServiceName
                ? "border-red-200 bg-red-50 text-red-900"
                : data.isHosting || data.isAnycast
                  ? "border-orange-200 bg-orange-50 text-orange-950"
                  : lowAccuracy
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-violet-100 bg-violet-50 text-violet-900"
            }`}
          >
            {(data.isVpn || data.privacyServiceName) && (
              <span className="mb-1 block font-semibold">
                {data.privacyServiceName
                  ? `${data.privacyServiceName} 감지 — 표시 위치가 실제와 다를 수 있습니다.`
                  : "VPN/프록시가 감지되었습니다 — 표시 위치가 실제와 다를 수 있습니다."}
              </span>
            )}
            {data.isHosting && !data.isVpn && (
              <span className="mb-1 block font-semibold">
                호스팅·데이터센터 IP — 거주지 위치가 아닐 수 있습니다.
              </span>
            )}
            {data.accuracyNote}
          </p>
        )}

      {showPolice ? (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="mb-3 text-sm font-bold text-slate-900">
            관할 경찰관서 (경찰청 [별표2] · 구 관할)
          </h3>
          {policeLoading ? (
            <div className="space-y-2">
              <div className="h-5 animate-pulse rounded bg-slate-100" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-slate-100" />
            </div>
          ) : policeStation ? (
            <dl className="space-y-3">
              <InfoRow label="경찰서" value={policeStation.name} />
              <InfoRow label="주소" value={policeStation.address} />
              <InfoRow label="전화" value={policeStation.phone} />
              <InfoRow
                label="거리"
                value={
                  policeStation.distanceM >= 1000
                    ? `${(policeStation.distanceM / 1000).toFixed(1)} km`
                    : `${policeStation.distanceM} m`
                }
              />
            </dl>
          ) : (
            <p className="text-sm text-slate-500">
              해당 위치 근처 경찰서 정보를 찾을 수 없습니다.
            </p>
          )}
        </div>
      ) : null}

      <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-400">
        {precise
          ? "표시 좌표는 카카오 주소·GPS 기준 단일 핀입니다."
          : "IP 추정 위치입니다. GPS 등록 시 동일 IP에 대해 오차 없이 표시됩니다."}
      </p>
    </section>
  );
}
