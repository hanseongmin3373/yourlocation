"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPosition, PoliceStationInfo } from "@/lib/types";

interface KakaoMapProps {
  position: MapPosition | null;
  label?: string;
  policeStation?: PoliceStationInfo | null;
  heightClass?: string;
  /** 부모 flex/grid 셀 높이에 맞춤 */
  fillContainer?: boolean;
  fullBleed?: boolean;
  mapLevel?: number;
  /** 미터 단위 오차 원 (최대 5km) */
  accuracyRadiusM?: number;
  /** 지도 오차 원 라벨 */
  accuracyLabel?: string;
  /** gps | ip — 원 색상 */
  circleVariant?: "gps" | "ip";
  exactPin?: boolean;
}
function loadKakaoMapScript(appKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kakao?.maps) {
      resolve();
      return;
    }

    const existing = document.getElementById("kakao-map-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("카카오맵 스크립트 로드 실패")),
      );
      return;
    }

    const script = document.createElement("script");
    script.id = "kakao-map-script";
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("카카오맵 스크립트 로드 실패"));
    document.head.appendChild(script);
  });
}

type MapOverlay = { setMap: (map: unknown | null) => void };

export default function KakaoMap({
  position,
  label,
  policeStation,
  heightClass = "h-[50vh] min-h-[280px]",
  fillContainer = false,
  fullBleed = false,
  mapLevel = 3,
  accuracyRadiusM,
  accuracyLabel,
  circleVariant = "ip",
  exactPin = true,
}: KakaoMapProps) {
  const resolvedHeight = fillContainer ? "h-full min-h-0" : heightClass;
  const frameClass = fullBleed || fillContainer
    ? `${resolvedHeight} w-full`
    : `${resolvedHeight} w-full overflow-hidden rounded-2xl border border-slate-200`;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const overlaysRef = useRef<MapOverlay[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

  useEffect(() => {
    if (!appKey) {
      setError("카카오맵 API 키가 설정되지 않았습니다.");
      return;
    }

    let cancelled = false;

    loadKakaoMapScript(appKey)
      .then(() => {
        if (cancelled) return;
        window.kakao.maps.load(() => {
          if (!cancelled) setReady(true);
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "지도 로드 실패");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [appKey]);

  useEffect(() => {
    if (!ready || !mapRef.current || !position || !window.kakao?.maps) return;

    const { kakao } = window;
    const center = new kakao.maps.LatLng(position.lat, position.lng);

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new kakao.maps.Map(mapRef.current, {
        center,
        level: mapLevel,
      });
    }

    const map = mapInstanceRef.current;
    if (fillContainer) {
      window.requestAnimationFrame(() => {
        (map as { relayout?: () => void }).relayout?.();
      });
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const ipMarker = new kakao.maps.Marker({
      position: center,
      zIndex: 2,
    });
    ipMarker.setMap(map);
    overlaysRef.current.push(ipMarker);

    if (!exactPin && accuracyRadiusM && accuracyRadiusM > 0) {
      const isGps = circleVariant === "gps";
      const strokeColor = isGps ? "#059669" : "#2563eb";
      const fillColor = isGps ? "#10b981" : "#3b82f6";
      const circle = new kakao.maps.Circle({
        center,
        radius: accuracyRadiusM,
        strokeWeight: 2,
        strokeColor,
        strokeOpacity: 0.85,
        strokeStyle: "solid",
        fillColor,
        fillOpacity: isGps ? 0.18 : 0.22,
        zIndex: 1,
      });
      circle.setMap(map);
      overlaysRef.current.push(circle);

      if (accuracyLabel) {
        const labelOverlay = new kakao.maps.CustomOverlay({
          position: center,
          content: `<div style="padding:4px 8px;background:rgba(255,255,255,.95);border-radius:6px;font-size:11px;font-weight:700;box-shadow:0 1px 6px rgba(0,0,0,.12);white-space:nowrap;border:1px solid ${isGps ? "#6ee7b7" : "#93c5fd"};color:${isGps ? "#065f46" : "#1e40af"};">${accuracyLabel}</div>`,
          yAnchor: -0.5,
          zIndex: 4,
        });
        labelOverlay.setMap(map);
        overlaysRef.current.push(labelOverlay);
      }
    }

    if (label && exactPin) {
      const labelOverlay = new kakao.maps.CustomOverlay({
        position: center,
        content: `<div style="padding:6px 10px;background:#fff;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;border:1px solid #86efac;">${label}</div>`,
        yAnchor: 2.4,
        zIndex: 3,
      });
      labelOverlay.setMap(map);
      overlaysRef.current.push(labelOverlay);
    }

    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(center);

    const policeHasCoords =
      policeStation != null &&
      Number.isFinite(policeStation.lat) &&
      Number.isFinite(policeStation.lng);

    if (policeHasCoords) {
      const policeCenter = new kakao.maps.LatLng(
        policeStation.lat,
        policeStation.lng,
      );
      bounds.extend(policeCenter);

      const policeMarker = new kakao.maps.Marker({
        position: policeCenter,
        zIndex: 2,
      });
      policeMarker.setMap(map);
      overlaysRef.current.push(policeMarker);

      const policeOverlay = new kakao.maps.CustomOverlay({
        position: policeCenter,
        content: `<div style="padding:6px 10px;background:#1e3a8a;color:#fff;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.2);white-space:nowrap;">🚔 ${policeStation.name}</div>`,
        yAnchor: 2.4,
        zIndex: 3,
      });
      policeOverlay.setMap(map);
      overlaysRef.current.push(policeOverlay);

      const line = new kakao.maps.Polyline({
        path: [center, policeCenter],
        strokeWeight: 2,
        strokeColor: "#64748b",
        strokeOpacity: 0.7,
        strokeStyle: "shortdash",
      });
      line.setMap(map);
      overlaysRef.current.push(line);
    }

    if (!exactPin && accuracyRadiusM && accuracyRadiusM > 0) {
      const latOffset = accuracyRadiusM / 111_320;
      const lngOffset =
        accuracyRadiusM /
        (111_320 * Math.cos((position.lat * Math.PI) / 180));
      bounds.extend(
        new kakao.maps.LatLng(position.lat + latOffset, position.lng),
      );
      bounds.extend(
        new kakao.maps.LatLng(position.lat - latOffset, position.lng),
      );
      bounds.extend(
        new kakao.maps.LatLng(position.lat, position.lng + lngOffset),
      );
      bounds.extend(
        new kakao.maps.LatLng(position.lat, position.lng - lngOffset),
      );
    }

    (map as { setCenter: (c: unknown) => void; setLevel: (l: number) => void }).setCenter(center);
    (map as { setLevel: (l: number) => void }).setLevel(mapLevel);

    if (policeHasCoords || (!exactPin && accuracyRadiusM)) {
      (map as { setBounds: (b: unknown, padding?: number) => void }).setBounds(
        bounds,
        48,
      );
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [ready, position, label, policeStation, mapLevel, accuracyRadiusM, accuracyLabel, circleVariant, exactPin, fillContainer]);
  if (error) {
    const isMissingKey = error.includes("설정되지 않았습니다");
    return (
      <div
        className={`flex ${resolvedHeight} items-center justify-center ${fillContainer ? "" : "rounded-2xl border border-dashed border-slate-200"} bg-slate-50 px-6 text-center text-sm text-slate-500`}
      >
        {error}
        <br />
        <span className="mt-1 text-xs text-slate-400">
          {isMissingKey ? (
            <>
              Vercel → Settings → Environment Variables에{" "}
              <strong>NEXT_PUBLIC_KAKAO_MAP_KEY</strong>(JavaScript 키)를
              Production·Preview·Development 모두 체크 후 저장하고 Redeploy
              해주세요.
            </>
          ) : (
            <>
              JavaScript 키가 맞는지, 카카오 Developers → Web 도메인에{" "}
              yourlocation.co.kr / www.yourlocation.co.kr /
              yourlocation.vercel.app 이 등록됐는지 확인해주세요.
            </>
          )}
        </span>
      </div>
    );
  }

  if (!position) {
    return (
      <div
        className={`flex ${resolvedHeight} items-center justify-center ${fillContainer ? "" : "rounded-2xl border border-dashed border-slate-200"} bg-slate-50 text-sm text-slate-400`}
      >
        위치 정보가 표시되면 지도가 나타납니다
      </div>
    );
  }

  return (
    <div className={fillContainer ? "relative h-full min-h-0" : "relative"}>
      <div ref={mapRef} className={frameClass} aria-label="카카오맵" />
    </div>
  );
}
