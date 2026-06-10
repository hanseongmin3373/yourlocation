"use client";

import { useEffect, useRef, useState } from "react";
import type { MapPosition } from "@/lib/types";

interface KakaoMapProps {
  position: MapPosition | null;
  label?: string;
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

export default function KakaoMap({ position, label }: KakaoMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
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
        level: 3,
      });
    } else {
      (mapInstanceRef.current as { setCenter: (c: unknown) => void }).setCenter(
        center,
      );
    }

    if (markerRef.current) {
      (markerRef.current as { setMap: (m: null) => void }).setMap(null);
    }

    markerRef.current = new kakao.maps.Marker({ position: center });

    (markerRef.current as { setMap: (m: unknown) => void }).setMap(
      mapInstanceRef.current,
    );

    if (label) {
      const overlay = new kakao.maps.CustomOverlay({
        position: center,
        content: `<div style="padding:6px 10px;background:#fff;border-radius:8px;font-size:12px;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;">${label}</div>`,
        yAnchor: 2.2,
      });
      overlay.setMap(mapInstanceRef.current);
    }
  }, [ready, position, label]);

  if (error) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-500">
        {error}
        <br />
        <span className="mt-1 text-xs text-slate-400">
          .env.local에 NEXT_PUBLIC_KAKAO_MAP_KEY를 설정해주세요.
        </span>
      </div>
    );
  }

  if (!position) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
        위치 정보가 표시되면 지도가 나타납니다
      </div>
    );
  }

  return (
    <div
      ref={mapRef}
      className="h-full min-h-[280px] w-full overflow-hidden rounded-2xl border border-slate-200 sm:min-h-[360px]"
      aria-label="카카오맵"
    />
  );
}
