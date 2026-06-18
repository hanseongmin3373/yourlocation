"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CurrentLocationButton from "@/components/CurrentLocationButton";
import Header from "@/components/Header";
import IpBanner from "@/components/IpBanner";
import IpSearchForm from "@/components/IpSearchForm";
import KakaoMap from "@/components/KakaoMap";
import LocationInfo from "@/components/LocationInfo";
import LocationRegisterHero from "@/components/LocationRegisterHero";
import LocationRegisterModal from "@/components/LocationRegisterModal";
import SiteFooter from "@/components/SiteFooter";
import UtilityLinks from "@/components/UtilityLinks";
import UsageBanner from "@/components/UsageBanner";
import {
  isOwnIpQuery,
  previewGpsLocation,
  submitLocationRegister,
  type GpsPreview,
} from "@/lib/client-location";
import { resolveVisitorIp } from "@/lib/detect-client-ip";
import {
  displayAccuracyRadiusM,
  enforceZeroErrorPolicy,
  formatDistrictLocationLabel,
  isPreciseLocation,
  MAX_ALLOWED_ACCURACY_M,
} from "@/lib/geo-accuracy";
import type { SearchQueryType } from "@/lib/ip-validation";
import {
  clearLocationConsent,
  getLocationConsent,
  markLocationRegistered,
} from "@/lib/location-consent";
import type { GeoLocationData, MapPosition, PoliceStationInfo } from "@/lib/types";

const REGISTER_DISMISS_KEY = "yourlocation_register_dismissed";
const DB_REFRESH_KEY = "yourlocation_db_refreshed";

type HomePageProps = {
  initialIp?: string;
};

export default function HomePage({ initialIp = "" }: HomePageProps) {
  const [clientIp, setClientIp] = useState("");
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
  const [isLocationRegistered, setIsLocationRegistered] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [gpsPreview, setGpsPreview] = useState<GpsPreview | null>(null);
  const [crowdStatsRefresh, setCrowdStatsRefresh] = useState(0);
  const [registerTotalCount, setRegisterTotalCount] = useState<number | null>(
    null,
  );
  const autoGpsRequested = useRef(false);

  const fetchPoliceStation = useCallback(
    async (
      lat: number,
      lng: number,
      opts?: { sido?: string; sigungu?: string; dong?: string },
    ) => {
      setPoliceLoading(true);
      setPoliceStation(null);

      const params = new URLSearchParams({
        lat: String(lat),
        lng: String(lng),
      });
      if (opts?.sido) params.set("sido", opts.sido);
      if (opts?.sigungu) params.set("sigungu", opts.sigungu);
      if (opts?.dong) params.set("dong", opts.dong);

      try {
        const res = await fetch(
          `/api/nearest-police-station?${params.toString()}`,
        );
        const json = await res.json();
        setPoliceStation(json.success ? json.data : null);
      } catch {
        setPoliceStation(null);
      } finally {
        setPoliceLoading(false);
      }
    },
    [],
  );

  const applyLocation = useCallback(
    (data: GeoLocationData, remaining?: number | null) => {
      const normalized = enforceZeroErrorPolicy(data);
      setLocationData(normalized);
      setMapPosition({ lat: normalized.lat, lng: normalized.lon });
      void fetchPoliceStation(normalized.lat, normalized.lon, {
        sido: normalized.sido,
        sigungu: normalized.sigungu,
        dong: normalized.dong,
      });
      if (typeof remaining === "number") {
        window.dispatchEvent(
          new CustomEvent("usage-updated", { detail: { remaining } }),
        );
      }
    },
    [fetchPoliceStation],
  );

  const fetchRemoteIp = useCallback(
    async (ip: string) => {
      const res = await fetch(
        `/api/geolocation?ip=${encodeURIComponent(ip)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "조회에 실패했습니다.");
      }
      applyLocation(json.data, json.remaining);
      return json.data as GeoLocationData;
    },
    [applyLocation],
  );

  const handleSearch = useCallback(
    async (query: string, type: SearchQueryType) => {
      if (!isLocationRegistered) {
        setRegisterModalOpen(true);
        setRegisterError("검색 기능은 위치 등록 후 이용할 수 있습니다.");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        if (type === "coords") {
          setInfoTitle("좌표 검색 결과");
          const res = await fetch(
            `/api/coord-search?q=${encodeURIComponent(query)}`,
            { cache: "no-store" },
          );
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error || "좌표 검색에 실패했습니다.");
          }
          applyLocation(json.data, json.remaining);
          return;
        }

        if (type === "address") {
          setInfoTitle("주소 검색 결과");
          const res = await fetch(
            `/api/address-search?q=${encodeURIComponent(query)}`,
            { cache: "no-store" },
          );
          const json = await res.json();
          if (!json.success) {
            throw new Error(json.error || "조회에 실패했습니다.");
          }
          applyLocation(json.data, json.remaining);
          return;
        }

        if (clientIp && isOwnIpQuery(query, clientIp)) {
          setInfoTitle("내 IP 위치");
          const data = await fetchRemoteIp(query);
          setInfoTitle(
            data.userVerified
              ? "내 IP 위치 (확인됨 · 오차 없음)"
              : "내 IP 위치 (동·구 추정)",
          );
          return;
        }

        setInfoTitle("IP 위치 조회");
        const data = await fetchRemoteIp(query);
        setInfoTitle(
          data.userVerified
            ? "IP 위치 (등록 DB · 확인됨 · 오차 없음)"
            : "IP 위치 (동·구 추정)",
        );
      } catch (err) {
        if (
          clientIp &&
          isOwnIpQuery(query, clientIp) &&
          type === "ip"
        ) {
          try {
            setInfoTitle("IP 위치 정보 (구·군 단위)");
            await fetchRemoteIp(query);
            setError(
              err instanceof Error
                ? `${err.message} (구·군 단위 IP 추정으로 표시합니다)`
                : null,
            );
            return;
          } catch {
            // fall through
          }
        }

        setError(
          err instanceof Error ? err.message : "조회에 실패했습니다.",
        );
        setLocationData(null);
        setMapPosition(null);
        setPoliceStation(null);
      } finally {
        setLoading(false);
      }
    },
    [applyLocation, clientIp, fetchRemoteIp, isLocationRegistered],
  );

  const handleRequestLocation = useCallback(async () => {
    setRegisterLoading(true);
    setRegisterError(null);
    try {
      const preview = await previewGpsLocation();
      setGpsPreview(preview);
    } catch (err) {
      setRegisterError(
        err instanceof Error ? err.message : "위치 확인에 실패했습니다.",
      );
    } finally {
      setRegisterLoading(false);
    }
  }, []);

  const handleRegisterLocation = useCallback(
    async (preview: GpsPreview) => {
      if (!clientIp) return;

      setRegisterLoading(true);
      setRegisterError(null);

      try {
        const result = await submitLocationRegister(preview);
        if (!result.success) {
          throw new Error(result.error || "위치 등록에 실패했습니다.");
        }

        const exactPin = Boolean(preview.userVerified);

        if (preview.userVerified) {
          markLocationRegistered();
          setIsLocationRegistered(true);
        }
        setRegisterModalOpen(false);
        setGpsPreview(null);
        setRegisterTotalCount(result.totalCount ?? null);
        setCrowdStatsRefresh((n) => n + 1);
        sessionStorage.removeItem(REGISTER_DISMISS_KEY);
        sessionStorage.setItem(DB_REFRESH_KEY, "1");

        setInfoTitle("내 IP 위치 (GPS 등록)");
        applyLocation({
          ip: clientIp,
          country: "대한민국",
          countryCode: "KR",
          region: preview.sido || "",
          city: preview.sigungu || "",
          zip: "",
          lat: preview.lat,
          lon: preview.lon,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          isp: "",
          org: "",
          as: "",
          address: preview.address,
          dong: preview.dong,
          sido: preview.sido,
          sigungu: preview.sigungu,
          roadAddress: preview.roadAddress || preview.address,
          locationSource: preview.userVerified ? "pinpoint" : "gps",
          accuracyNote: preview.userVerified
            ? "사용자 확인 주소 — 오차 없음"
            : `GPS 등록 DB 반영 · 적용주소 ${result.appliedAddress || preview.appliedAddress}`,
          accuracyM: exactPin ? undefined : preview.accuracyM,
          precisionScore: preview.userVerified ? 95 : exactPin ? 88 : 65,
          confidenceLevel: exactPin ? "high" : "medium",
          expertMode: true,
          exactPin,
          userVerified: preview.userVerified,
          geoSources: ["crowd-db"],
        });
      } catch (err) {
        setRegisterError(
          err instanceof Error ? err.message : "위치 등록에 실패했습니다.",
        );
      } finally {
        setRegisterLoading(false);
      }
    },
    [applyLocation, clientIp],
  );

  const handleCloseRegisterModal = useCallback(() => {
    sessionStorage.setItem(REGISTER_DISMISS_KEY, "1");
    setRegisterModalOpen(false);
    setRegisterError(null);
    setGpsPreview(null);
  }, []);

  const handleEraseRegistration = useCallback(async () => {
    if (
      !window.confirm(
        "등록된 IP 위치 데이터를 삭제할까요? 삭제 후 위치 등록을 다시 해야 검색이 가능합니다.",
      )
    ) {
      return;
    }

    try {
      await fetch("/api/location-register", { method: "DELETE" });
      clearLocationConsent();
      sessionStorage.removeItem(DB_REFRESH_KEY);
      setIsLocationRegistered(false);
      setRegisterModalOpen(true);
      setCrowdStatsRefresh((n) => n + 1);
    } catch {
      setError("등록 데이터 삭제에 실패했습니다.");
    }
  }, []);

  const openRegisterModal = useCallback(() => {
    setRegisterError(null);
    setGpsPreview(null);
    setRegisterModalOpen(true);
  }, []);

  const handleCurrentLocation = useCallback(() => {
    openRegisterModal();
    void handleRequestLocation();
  }, [openRegisterModal, handleRequestLocation]);

  useEffect(() => {
    const registered = getLocationConsent() === "registered";
    setIsLocationRegistered(registered);
    const dismissed =
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(REGISTER_DISMISS_KEY) === "1";
    setRegisterModalOpen(!registered && !dismissed);
  }, []);

  useEffect(() => {
    if (
      !registerModalOpen ||
      isLocationRegistered ||
      autoGpsRequested.current ||
      !clientIp ||
      typeof navigator === "undefined" ||
      !navigator.geolocation
    ) {
      return;
    }

    autoGpsRequested.current = true;
    void handleRequestLocation();
  }, [
    registerModalOpen,
    isLocationRegistered,
    clientIp,
    handleRequestLocation,
  ]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const ip = await resolveVisitorIp(initialIp || undefined);
        if (cancelled) return;

        if (!ip) {
          setError("접속 IP를 가져올 수 없습니다.");
          return;
        }

        setClientIp(ip);

        const registered = getLocationConsent() === "registered";
        const dismissed =
          typeof sessionStorage !== "undefined" &&
          sessionStorage.getItem(REGISTER_DISMISS_KEY) === "1";

        if (!registered && !dismissed) {
          setInfoTitle("GPS 위치 등록");
          setLoading(false);
          return;
        }

        if (!registered && dismissed) {
          setInfoTitle("GPS 위치 등록 필요");
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);
        setInfoTitle("내 IP 위치");

        try {
          const data = await fetchRemoteIp(ip);
          if (!cancelled) {
            if (data.userVerified) {
              markLocationRegistered();
              setIsLocationRegistered(true);
              setInfoTitle("내 IP 위치 (확인됨 · 오차 없음)");
            } else {
              clearLocationConsent();
              sessionStorage.removeItem(REGISTER_DISMISS_KEY);
              setIsLocationRegistered(false);
              setRegisterModalOpen(true);
              setRegisterError(
                "정확한 위치(오차 없음)를 위해 GPS 등록 후 주소를 확인해 주세요.",
              );
            }
          }
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof Error
                ? err.message
                : "조회에 실패했습니다.",
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("접속 IP를 가져올 수 없습니다.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyLocation, fetchRemoteIp, initialIp]);

  const isPrecise = Boolean(locationData && isPreciseLocation(locationData));
  const accuracyExceeded =
    locationData?.accuracyM != null &&
    locationData.accuracyM > MAX_ALLOWED_ACCURACY_M;
  const mapAccuracyRadius = displayAccuracyRadiusM(
    isPrecise ? undefined : locationData?.accuracyM,
  );

  const locationSummary = locationData
    ? isPrecise
      ? locationData.address
      : formatDistrictLocationLabel(locationData) || locationData.address
    : null;

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <LocationRegisterModal
        open={registerModalOpen}
        clientIp={clientIp}
        loading={registerLoading}
        error={registerError}
        preview={gpsPreview}
        totalCount={registerTotalCount}
        onRequestLocation={() => void handleRequestLocation()}
        onRegister={(preview) => void handleRegisterLocation(preview)}
        onClose={handleCloseRegisterModal}
      />

      <LocationRegisterHero
        isRegistered={Boolean(locationData?.userVerified)}
        clientIp={clientIp}
        onRegister={openRegisterModal}
        crowdStatsRefresh={crowdStatsRefresh}
      />

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
                clientIp={clientIp}
                onSearch={(q, type) => void handleSearch(q, type)}
                loading={loading}
                disabled={!isLocationRegistered}
                disabledMessage="위치 등록 후 IP·주소 검색이 가능합니다."
              />
            </div>
            <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
              {locationSummary && (
                <p className="text-sm text-slate-700">
                  위치 :{" "}
                  <strong className="font-semibold text-slate-900">
                    {locationSummary}
                  </strong>
                  {isPrecise ? (
                    <span className="ml-1 text-xs font-medium text-emerald-700">
                      {locationData?.locationSource === "gps"
                        ? "(GPS)"
                        : "(좌표 고정)"}
                    </span>
                  ) : locationData ? (
                    <span className="ml-1 text-xs font-medium text-blue-700">
                      (동·구 추정
                      {locationData.accuracyM
                        ? ` ±${Math.round(locationData.accuracyM)}m`
                        : ""}
                      )
                    </span>
                  ) : null}
                </p>
              )}
              <CurrentLocationButton
                onLocate={() => void handleCurrentLocation()}
                loading={geoLoading}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-violet-800">
            {isPrecise ? (
              <>
                <strong className="font-semibold">정밀 모드</strong> — 오차
                5km 이내 단일 좌표. 본인 IP는 GPS 실측·등록 DB를 우선합니다.
              </>
            ) : (
              <>
                <strong className="font-semibold">동·구 추정 모드</strong> —
                mylocation과 같이 시·군·구·동 단위로 표시합니다. 도로명·오차
                없는 위치는 해당 IP의 GPS 등록·주소 확인 데이터가 있을 때만
                제공됩니다.
              </>
            )}
          </p>
        </section>

        {accuracyExceeded && (
          <div
            role="status"
            className="mb-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          >
            추정 오차가 5km를 초과합니다. 정밀 핀 표시가 제한됩니다 —{" "}
            <button
              type="button"
              onClick={openRegisterModal}
              className="font-semibold underline hover:text-amber-900"
            >
              위치 등록/재등록
            </button>
            을 권장합니다.
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-900"
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
          label={isPrecise ? locationData?.address : undefined}
          policeStation={policeStation}
          mapLevel={isPrecise ? 2 : 6}
          accuracyRadiusM={mapAccuracyRadius}
          exactPin={isPrecise}
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

      <SiteFooter
        onEraseData={() => void handleEraseRegistration()}
        crowdStatsRefresh={crowdStatsRefresh}
      />
    </div>
  );
}
