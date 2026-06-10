"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPosition, PoliceStationInfo } from "@/lib/types";

interface KakaoMapProps {
  position: MapPosition | null;
  label?: string;
  policeStation?: PoliceStationInfo | null;
  heightClass?: string;
  fullBleed?: boolean;
}

const IP_CIRCLE_RADIUS = 800;
const CURSOR_CIRCLE_RADIUS = 400;

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
  fullBleed = false,
}: KakaoMapProps) {
  const frameClass = fullBleed
    ? `${heightClass} w-full`
    : `${heightClass} w-full overflow-hidden rounded-2xl border border-slate-200`;

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const overlaysRef = useRef<MapOverlay[]>([]);
  const cursorCircleRef = useRef<MapOverlay | null>(null);
  const mousemoveHandlerRef = useRef<((e: unknown) => void) | null>(null);
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
        level: 5,
      });
    }

    const map = mapInstanceRef.current;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    cursorCircleRef.current = null;

    if (mousemoveHandlerRef.current) {
      kakao.maps.event.removeListener(
        map,
        "mousemove",
        mousemoveHandlerRef.current,
      );
      mousemoveHandlerRef.current = null;
    }

    const ipCircle = new kakao.maps.Circle({
      center,
      radius: IP_CIRCLE_RADIUS,
      strokeWeight: 2,
      strokeColor: "#2563eb",
      strokeOpacity: 0.85,
      strokeStyle: "solid",
      fillColor: "#3b82f6",
      fillOpacity: 0.18,
    });
    ipCircle.setMap(map);
    overlaysRef.current.push(ipCircle);

    const ipMarker = new kakao.maps.Marker({
      position: center,
      zIndex: 2,
    });
    ipMarker.setMap(map);
    overlaysRef.current.push(ipMarker);

    if (label) {
      const labelOverlay = new kakao.maps.CustomOverlay({
        position: center,
        content: `<div style="padding:6px 10px;background:#fff;border-radius:8px;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;border:1px solid #bfdbfe;">${label}</div>`,
        yAnchor: 2.4,
        zIndex: 3,
      });
      labelOverlay.setMap(map);
      overlaysRef.current.push(labelOverlay);
    }

    const bounds = new kakao.maps.LatLngBounds();
    bounds.extend(center);

    if (policeStation) {
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

    const cursorCircle = new kakao.maps.Circle({
      center,
      radius: CURSOR_CIRCLE_RADIUS,
      strokeWeight: 2,
      strokeColor: "#059669",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      fillColor: "#10b981",
      fillOpacity: 0.12,
      zIndex: 1,
    });
    cursorCircle.setMap(map);
    cursorCircleRef.current = cursorCircle;
    overlaysRef.current.push(cursorCircle);

    const onMouseMove = (mouseEvent: unknown) => {
      const latLng = (mouseEvent as { latLng: unknown }).latLng as {
        getLat: () => number;
        getLng: () => number;
      };
      cursorCircle.setPosition(latLng);
    };

    mousemoveHandlerRef.current = onMouseMove;
    kakao.maps.event.addListener(map, "mousemove", onMouseMove);

    (map as { setBounds: (b: unknown, padding?: number) => void }).setBounds(
      bounds,
      48,
    );

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];

      if (mousemoveHandlerRef.current && mapInstanceRef.current) {
        kakao.maps.event.removeListener(
          mapInstanceRef.current,
          "mousemove",
          mousemoveHandlerRef.current,
        );
        mousemoveHandlerRef.current = null;
      }
    };
  }, [ready, position, label, policeStation]);

  if (error) {
    const isMissingKey = error.includes("설정되지 않았습니다");
    return (
      <div
        className={`flex ${heightClass} items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500`}
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
              yourlocation.vercel.app 이 등록됐는지, 카카오맵 사용 설정이
              켜져 있는지 확인해주세요.
            </>
          )}
        </span>
      </div>
    );
  }

  if (!position) {
    return (
      <div
        className={`flex ${heightClass} items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400`}
      >
        위치 정보가 표시되면 지도가 나타납니다
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={mapRef} className={frameClass} aria-label="카카오맵" />
      <p className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-[11px] text-slate-600 shadow-sm">
        파란 원: IP 추정 위치 · 초록 원: 마우스 위치 (지도 위에서 이동)
      </p>
    </div>
  );
}
