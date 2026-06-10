import type { GeoLocationData } from "@/lib/types";

interface LocationInfoProps {
  data: GeoLocationData | null;
  loading?: boolean;
  title?: string;
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

export default function LocationInfo({
  data,
  loading,
  title = "위치 정보",
}: LocationInfoProps) {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
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

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900">{title}</h2>
      <dl className="space-y-3">
        <InfoRow label="IP 주소" value={data.ip} />
        <InfoRow label="주소" value={data.address} />
        <InfoRow
          label="위도 / 경도"
          value={`${data.lat.toFixed(6)}, ${data.lon.toFixed(6)}`}
        />
        <InfoRow label="국가" value={`${data.country} (${data.countryCode})`} />
        <InfoRow label="지역" value={data.region} />
        <InfoRow label="도시" value={data.city} />
        <InfoRow label="우편번호" value={data.zip} />
        <InfoRow label="시간대" value={data.timezone} />
        <InfoRow label="ISP" value={data.isp} />
        <InfoRow label="조직" value={data.org} />
      </dl>
    </section>
  );
}
