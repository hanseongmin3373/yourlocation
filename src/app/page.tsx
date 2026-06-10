"use client";

import { useCallback, useEffect, useState } from "react";
import CurrentLocationButton from "@/components/CurrentLocationButton";
import Header from "@/components/Header";
import IpBanner from "@/components/IpBanner";
import IpSearchForm from "@/components/IpSearchForm";
import KakaoMap from "@/components/KakaoMap";
import LocationInfo from "@/components/LocationInfo";
import UtilityLinks from "@/components/UtilityLinks";
import UsageBanner, { updateUsageFromResponse } from "@/components/UsageBanner";
import type { GeoLocationData, MapPosition, PoliceStationInfo } from "@/lib/types";

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
  const [policeStation, setPoliceStation] = useState<PoliceStationInfo | null>(
    null,
  );
  const [policeLoading, setPoliceLoading] = useState(false);

  const fetchPoliceStation = useCallback(async (lat: number, lng: number) => {
    setPoliceLoading(true);
    setPoliceStation(null);

    try {
      const res = await fetch(
        `/api/nearest-police-station?lat=${lat}&lng=${lng}`,
      );
      const json = await res.json();
      setPoliceStation(json.success ? json.data : null);
    } catch {
      setPoliceStation(null);
    } finally {
      setPoliceLoading(false);
    }
  }, []);

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
      void fetchPoliceStation(json.data.lat, json.data.lon);
      updateUsageFromResponse(json.remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회에 실패했습니다.");
      setLocationData(null);
      setMapPosition(null);
      setPoliceStation(null);
    } finally {
      setLoading(false);
    }
  }, [fetchPoliceStation]);

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

        try {
          const res = await fetch("/api/geolocation/gps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lat, lng }),
          });
          const json = await res.json();

          if (!json.success) {
            throw new Error(json.error || "GPS 조회에 실패했습니다.");
          }

          const address =
            json.address || `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

          setLocationData({
            ip: clientIp || "-",
            country: "대한민국",
            countryCode: "KR",
            region: json.sido || "",
            city: json.sigungu || "",
            zip: "",
            lat,
            lon: lng,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            isp: "",
            org: "",
            as: "",
            address,
            dong: json.dong || "",
            accuracyM: 50,
            locationSource: "gps",
            accuracyNote: "",
          });
          setMapPosition({ lat, lng });
          void fetchPoliceStation(lat, lng);
          updateUsageFromResponse(json.remaining);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "GPS 조회에 실패했습니다.",
          );
        } finally {
          setGeoLoading(false);
        }
      },
      () => {
        setError("위치 권한이 거부되었거나 위치를 가져올 수 없습니다.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const locationSummary =
    locationData?.address ||
    [locationData?.city, locationData?.region, locationData?.country]
      .filter(Boolean)
      .join(" ") ||
    null;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6">
        <div className="mb-3 space-y-2">
          <UtilityLinks ip={clientIp} />
          <UsageBanner />
          {clientIp && <IpBanner ip={clientIp} />}
        </div>

        <section className="mb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex-1">
              <IpSearchForm
                defaultIp={clientIp}
                onSearch={fetchIpLocation}
                loading={loading}
              />
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
              {locationSummary && (
                <p className="text-sm text-slate-700">
                  위치 :{" "}
                  <strong className="font-semibold text-slate-900">
                    {locationSummary}
                  </strong>
                </p>
              )}
              <CurrentLocationButton
                onLocate={handleCurrentLocation}
                loading={geoLoading}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-amber-700/90">
            IP 위치는 통신사 기준 추정이라 동(洞) 단위 오차가 큽니다. 상도동 등
            정확한 위치는{" "}
            <strong className="font-semibold">「현재 위치 확인」</strong>(GPS)을
            이용하세요.
          </p>
        </section>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}
      </div>

      <section className="mb-6 w-full border-y border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2 sm:px-6">
          <h2 className="text-sm font-bold text-emerald-800">지도</h2>
          {mapPosition && locationData && (
            <div className="flex gap-3 text-xs font-medium">
              <a
                href={`https://map.naver.com/v5/search/${locationData.lat},${locationData.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-800"
              >
                NAVER
              </a>
              <a
                href={`https://map.kakao.com/link/map/${encodeURIComponent(locationSummary ?? "위치")},${locationData.lat},${locationData.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-800"
              >
                DAUM
              </a>
            </div>
          )}
        </div>
        <KakaoMap
          position={mapPosition}
          label={locationData?.address}
          policeStation={policeStation}
          accuracyRadiusM={locationData?.accuracyM ?? 2500}
          heightClass="h-[50vh] min-h-[320px]"
          fullBleed
        />
      </section>

      <main className="mx-auto max-w-5xl px-4 pb-8 sm:px-6">
        <LocationInfo
          data={locationData}
          loading={loading || geoLoading}
          title={infoTitle}
          policeStation={policeStation}
          policeLoading={policeLoading}
        />
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} yourlocation.co.kr · IP 위치 조회 서비스
      </footer>
    </div>
  );
}
