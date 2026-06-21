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
import LocationStatusBar from "@/components/LocationStatusBar";
import {
  isOwnIpQuery,
  previewGpsLocation,
  submitLocationRegister,
  type GpsPreview,
} from "@/lib/client-location";
import { resolveVisitorIp } from "@/lib/detect-client-ip";
import {
  resolveIpLocation,
  resolveGpsOverlay,
  type LocationResolvedVia,
} from "@/lib/resolve-best-location";
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
  const [addressSearchOnly, setAddressSearchOnly] = useState(false);
  const [resolvedVia, setResolvedVia] = useState<LocationResolvedVia | undefined>();
  const [gpsFailed, setGpsFailed] = useState(false);
  const autoGpsRequested = useRef(false);
  const skipAutoGps = useRef(false);

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
      setResolvedVia(normalized.resolvedVia);
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

  const loadIpLocation = useCallback(
    async (ip: string, title?: string) => {
      setGeoLoading(true);
      setError(null);
      try {
        const result = await resolveIpLocation(ip);
        applyLocation(result.data, result.remaining);
        setResolvedVia("ip");
        setGpsFailed(false);
        setInfoTitle(title ?? "IP 위치 (ipinfo · crowd DB)");
        return result.data;
      } finally {
        setGeoLoading(false);
      }
    },
    [applyLocation],
  );

  const loadGpsOverlay = useCallback(
    async (ip: string) => {
      setGeoLoading(true);
      setError(null);
      try {
        const result = await resolveGpsOverlay(ip);
        applyLocation(result.data, result.remaining);
        setResolvedVia("gps");
        setGpsFailed(false);
        setInfoTitle("기기 GPS (IP 위치와 다를 수 있음 · ipinfo VPN)");
        return result.data;
      } catch (err) {
        setGpsFailed(true);
        throw err;
      } finally {
        setGeoLoading(false);
      }
    },
    [applyLocation],
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
          const data = await loadIpLocation(query);
          setInfoTitle(
            data.userVerified
              ? "내 IP 위치 (확인됨 · 오차 없음)"
              : "내 IP 위치 (ipinfo · crowd DB)",
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
    [applyLocation, clientIp, fetchRemoteIp, loadIpLocation],
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

        if (!preview.userVerified) {
          throw new Error(
            "주소 확인 후 등록해 주세요. GPS 자동 감지 주소만으로는 저장되지 않습니다.",
          );
        }

        const data = await fetchRemoteIp(clientIp);
        if (!data.userVerified) {
          throw new Error(
            "등록은 완료됐지만 확인 주소가 반영되지 않았습니다. 잠시 후 다시 시도해 주세요.",
          );
        }

        markLocationRegistered();
        setIsLocationRegistered(true);
        setAddressSearchOnly(false);
        setRegisterModalOpen(false);
        setGpsPreview(null);
        sessionStorage.removeItem(REGISTER_DISMISS_KEY);
        sessionStorage.setItem(DB_REFRESH_KEY, "1");
        setInfoTitle("내 IP 위치 (확인됨 · 오차 없음)");
      } catch (err) {
        setRegisterError(
          err instanceof Error ? err.message : "위치 등록에 실패했습니다.",
        );
      } finally {
        setRegisterLoading(false);
      }
    },
    [clientIp, fetchRemoteIp],
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
    } catch {
      setError("등록 데이터 삭제에 실패했습니다.");
    }
  }, []);

  const openRegisterModal = useCallback(() => {
    setRegisterError(null);
    setGpsPreview(null);
    setAddressSearchOnly(false);
    skipAutoGps.current = false;
    autoGpsRequested.current = false;
    setRegisterModalOpen(true);
  }, []);

  const handleCurrentLocation = useCallback(() => {
    if (!clientIp) return;
    void loadGpsOverlay(clientIp);
  }, [clientIp, loadGpsOverlay]);

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
      skipAutoGps.current ||
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
          setRegisterModalOpen(true);
        }

        setLoading(true);
        setError(null);
        setInfoTitle("위치 확인 중…");

        try {
          const data = await loadIpLocation(ip);
          if (!cancelled && data.userVerified) {
            markLocationRegistered();
            setIsLocationRegistered(true);
            setInfoTitle("내 IP 위치 (확인됨 · 오차 없음)");
          } else if (!cancelled && registered && !data.userVerified) {
            clearLocationConsent();
            setIsLocationRegistered(false);
            skipAutoGps.current = true;
            autoGpsRequested.current = false;
            setAddressSearchOnly(true);
            setRegisterModalOpen(true);
            setRegisterError(
              "저장된 주소 확인이 필요합니다. 아래에서 실제 도로명·지번을 검색해 등록해 주세요.",
            );
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
  }, [loadIpLocation, initialIp]);

  const isPrecise = Boolean(locationData && isPreciseLocation(locationData));
  const accuracyExceeded =
    locationData?.accuracyM != null &&
    locationData.accuracyM > MAX_ALLOWED_ACCURACY_M;
  const mapAccuracyRadius = displayAccuracyRadiusM(
    isPrecise ? undefined : locationData?.accuracyM,
  );
  const mapAccuracyLabel =
    mapAccuracyRadius != null
      ? mapAccuracyRadius >= 1000
        ? `±${(mapAccuracyRadius / 1000).toFixed(1)}km`
        : `±${Math.round(mapAccuracyRadius)}m`
      : undefined;
  const mapCircleVariant: "gps" | "ip" =
    resolvedVia === "gps" || locationData?.resolvedVia === "gps"
      ? "gps"
      : "ip";

  const locationSummary = locationData
    ? isPrecise
      ? locationData.address
      : formatDistrictLocationLabel(locationData) || locationData.address
    : null;

  return (
    <div className="app-shell bg-white">
      <Header />

      <LocationRegisterModal
        open={registerModalOpen}
        clientIp={clientIp}
        loading={registerLoading}
        error={registerError}
        preview={gpsPreview}
        addressSearchOnly={addressSearchOnly}
        onRequestLocation={() => void handleRequestLocation()}
        onRegister={(preview) => void handleRegisterLocation(preview)}
        onClose={handleCloseRegisterModal}
      />

      {/* 상단 검색·배너 (얇은 한 줄 영역) */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <IpSearchForm
                defaultIp={clientIp}
                clientIp={clientIp}
                onSearch={(q, type) => void handleSearch(q, type)}
                loading={loading}
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              {locationSummary && (
                <p className="hidden max-w-[220px] truncate text-xs text-slate-600 md:block">
                  <strong className="text-slate-900">{locationSummary}</strong>
                </p>
              )}
              <CurrentLocationButton
                onLocate={() => void handleCurrentLocation()}
                loading={geoLoading}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <LocationStatusBar
              data={locationData}
              resolvedVia={resolvedVia}
              gpsFailed={gpsFailed}
            />
            <UtilityLinks ip={clientIp} />
            <UsageBanner />
            {clientIp && <IpBanner ip={clientIp} />}
          </div>
          {(accuracyExceeded || error) && (
            <div className="space-y-1">
              {accuracyExceeded && (
                <div
                  role="status"
                  className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
                >
                  추정 오차 5km 초과 —{" "}
                  <button
                    type="button"
                    onClick={openRegisterModal}
                    className="font-semibold underline"
                  >
                    위치 등록/재등록
                  </button>
                </div>
              )}
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-900"
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 좌: 지도 50% | 우: 위치 정보 50% */}
      <div className="app-split" dir="ltr">
        <section className="app-split-map border-r border-slate-200" aria-label="지도">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-1.5">
            <h2 className="text-xs font-bold text-emerald-800 sm:text-sm">지도</h2>
            {mapPosition && locationData && (
              <div className="flex gap-2 text-[11px] font-medium sm:text-xs">
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
          <div className="relative min-h-0 flex-1 bg-slate-100">
            <KakaoMap
              position={mapPosition}
              label={isPrecise ? locationData?.address : undefined}
              policeStation={policeStation}
              mapLevel={isPrecise ? 2 : resolvedVia === "gps" ? 4 : 6}
              accuracyRadiusM={mapAccuracyRadius}
              accuracyLabel={mapAccuracyLabel}
              circleVariant={mapCircleVariant}
              exactPin={isPrecise}
              fillContainer
              fullBleed
            />
          </div>
        </section>

        <section className="app-split-info bg-slate-50/80" aria-label="위치 정보">
          {!locationData?.userVerified || !isLocationRegistered ? (
            <LocationRegisterHero
              compact
              isRegistered={Boolean(
                locationData?.userVerified && isLocationRegistered,
              )}
              clientIp={clientIp}
              onRegister={openRegisterModal}
            />
          ) : null}
          <div className="app-split-info-scroll p-3 sm:p-4">
            <LocationInfo
              data={locationData}
              loading={loading || geoLoading}
              title={infoTitle}
              policeStation={policeStation}
              policeLoading={policeLoading}
            />
            <div className="mt-4 border-t border-slate-200 pt-4">
              <SiteFooter
                onEraseData={() => void handleEraseRegistration()}
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
