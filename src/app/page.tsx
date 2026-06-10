"use client";

import { useCallback, useEffect, useState } from "react";
import CurrentLocationButton from "@/components/CurrentLocationButton";
import Header from "@/components/Header";
import IpSearchForm from "@/components/IpSearchForm";
import KakaoMap from "@/components/KakaoMap";
import LocationInfo from "@/components/LocationInfo";
import type { GeoLocationData, MapPosition } from "@/lib/types";

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/reverse-geocode?lat=${lat}&lng=${lng}`,
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.address ?? null;
  } catch {
    return null;
  }
}

export default function HomePage() {
  const [clientIp, setClientIp] = useState<string>("");
  const [locationData, setLocationData] = useState<GeoLocationData | null>(
    null,
  );
  const [mapPosition, setMapPosition] = useState<MapPosition | null>(null);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoTitle, setInfoTitle] = useState("위치 정보");

  const fetchIpLocation = useCallback(async (ip: string) => {
    setLoading(true);
    setError(null);
    setInfoTitle("IP 위치 정보");

    try {
      const res = await fetch(
        `/api/geolocation?ip=${encodeURIComponent(ip)}`,
      );
      const json = await res.json();

      if (!json.success) {
        throw new Error(json.error || "조회에 실패했습니다.");
      }

      setLocationData(json.data);
      setMapPosition({ lat: json.data.lat, lng: json.data.lon });
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회에 실패했습니다.");
      setLocationData(null);
      setMapPosition(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/ip")
      .then((r) => r.json())
      .then(({ ip }) => {
        setClientIp(ip);
        fetchIpLocation(ip);
      })
      .catch(() => setError("접속 IP를 가져올 수 없습니다."));
  }, [fetchIpLocation]);

  async function handleCurrentLocation() {
    if (!navigator.geolocation) {
      setError("이 브라우저는 위치 서비스를 지원하지 않습니다.");
      return;
    }

    setGeoLoading(true);
    setError(null);
    setInfoTitle("현재 위치 정보");

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const address =
          (await reverseGeocode(lat, lng)) ||
          `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        setLocationData({
          ip: clientIp || "-",
          country: "대한민국",
          countryCode: "KR",
          region: "",
          city: "",
          zip: "",
          lat,
          lon: lng,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          isp: "",
          org: "",
          as: "",
          address,
        });
        setMapPosition({ lat, lng });
        setGeoLoading(false);
      },
      () => {
        setError("위치 권한이 거부되었거나 위치를 가져올 수 없습니다.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <Header />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="mb-8 text-center sm:mb-10">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            IP 위치 조회
          </h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            IP 주소로 위치를 확인하고 지도에서 바로 확인하세요
          </p>
        </section>

        {clientIp && (
          <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-center text-sm text-blue-800 sm:px-6">
            접속하신 외부 IP 주소는{" "}
            <strong className="font-semibold">{clientIp}</strong> 입니다
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-slate-900">IP 검색</h2>
            <CurrentLocationButton
              onLocate={handleCurrentLocation}
              loading={geoLoading}
            />
          </div>
          <IpSearchForm
            defaultIp={clientIp}
            onSearch={fetchIpLocation}
            loading={loading}
          />
        </section>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <LocationInfo
            data={locationData}
            loading={loading || geoLoading}
            title={infoTitle}
          />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-slate-900">지도</h2>
            <KakaoMap
              position={mapPosition}
              label={locationData?.address}
            />
          </section>
        </div>

        <p className="mt-8 text-center text-xs leading-relaxed text-slate-400">
          제공되는 위치 서비스는 법적 효력이 없으며 정확한 위치를 보장하지
          않으므로 참고 목적으로만 사용하시기 바랍니다.
          <br />
          사용자의 자발적인 IP 정보 이외에 어떠한 정보도 수집하지 않습니다.
        </p>
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} yourlocation.co.kr · IP 위치 조회 서비스
      </footer>
    </div>
  );
}
