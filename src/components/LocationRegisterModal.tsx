"use client";

import { useCallback, useEffect, useState } from "react";
import type { AddressSearchHit, GpsPreview } from "@/lib/client-location";
import { searchRegisterAddress } from "@/lib/client-location";
import {
  REGISTRATION_GPS_BLOCK_CONFIRM_M,
  REGISTRATION_GPS_WARN_M,
} from "@/lib/geo-accuracy";

interface LocationRegisterModalProps {
  open: boolean;
  clientIp: string;
  loading?: boolean;
  error?: string | null;
  preview: GpsPreview | null;
  /** GPS 자동 감지 생략 — 주소 검색부터 */
  addressSearchOnly?: boolean;
  onRequestLocation: () => void;
  onRegister: (preview: GpsPreview) => void;
  onClose: () => void;
}

type Step = "gps" | "confirm" | "search";

export default function LocationRegisterModal({
  open,
  clientIp,
  loading,
  error,
  preview,
  addressSearchOnly = false,
  onRequestLocation,
  onRegister,
  onClose,
}: LocationRegisterModalProps) {
  const [step, setStep] = useState<Step>("gps");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AddressSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [confirmedPreview, setConfirmedPreview] = useState<GpsPreview | null>(
    null,
  );

  const activePreview = confirmedPreview ?? preview;

  const lowGpsAccuracy =
    preview != null && preview.accuracyM > REGISTRATION_GPS_WARN_M;
  const blockGpsConfirm =
    preview != null && preview.accuracyM > REGISTRATION_GPS_BLOCK_CONFIRM_M;

  useEffect(() => {
    if (!open) return;
    if (addressSearchOnly) {
      setStep("search");
    }
  }, [open, addressSearchOnly]);

  useEffect(() => {
    if (!preview || confirmedPreview) return;
    if (blockGpsConfirm) {
      setStep("search");
      setSearchError(
        `GPS 정확도가 ±${Math.round(preview.accuracyM)}m로 낮습니다. Wi-Fi·GPS를 켠 뒤 실제 도로명·지번을 검색해 주세요.`,
      );
    }
  }, [preview, confirmedPreview, blockGpsConfirm]);

  const resetFlow = useCallback(() => {
    setStep("gps");
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setConfirmedPreview(null);
  }, []);

  const handleClose = () => {
    resetFlow();
    onClose();
  };

  const handleConfirmAddress = () => {
    if (!preview) return;
    const verified: GpsPreview = {
      ...preview,
      userVerified: true,
      roadAddress: preview.address,
      appliedAddress: preview.address,
    };
    setConfirmedPreview(verified);
    setStep("confirm");
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const results = await searchRegisterAddress(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError("검색 결과가 없습니다.");
      }
    } catch (err) {
      setSearchError(
        err instanceof Error ? err.message : "주소 검색에 실패했습니다.",
      );
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  const handlePickAddress = (hit: AddressSearchHit) => {
    const verified: GpsPreview = {
      lat: hit.lat,
      lon: hit.lon,
      accuracyM: preview?.accuracyM ?? 15,
      address: hit.roadAddress || hit.address,
      roadAddress: hit.roadAddress || hit.address,
      appliedAddress: hit.roadAddress || hit.address,
      dong: hit.dong,
      sido: hit.sido,
      sigungu: hit.sigungu,
      userVerified: true,
      gpsLat: preview?.gpsLat ?? preview?.lat ?? hit.lat,
      gpsLon: preview?.gpsLon ?? preview?.lon ?? hit.lon,
    };
    setConfirmedPreview(verified);
    setStep("confirm");
    setSearchResults([]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-[2px]"
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-register-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-7"
      >
        <p
          id="location-register-title"
          className="text-center text-sm font-bold text-blue-700"
        >
          * 자신의 현재 위치를 등록해 주세요!! *
        </p>
        <p className="mt-2 text-center text-xs text-slate-600">
          <strong>GPS 확인 후 주소를 직접 검증</strong>합니다. 도로명·지번까지
          저장되어 오차 없이 표시됩니다.
        </p>

        {!preview && !addressSearchOnly && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRequestLocation}
              disabled={loading}
              className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
            >
              {loading ? "GPS 확인 중..." : "GPS 위치 허용"}
            </button>
          </div>
        )}

        {preview && step === "gps" && (
          <div className="mt-4 space-y-3">
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-slate-100">
                    <th className="bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">
                      GPS 감지 주소
                    </th>
                    <td className="px-3 py-2 text-slate-900">{preview.address}</td>
                  </tr>
                  <tr>
                    <th className="bg-slate-50 px-3 py-2 text-left font-medium text-slate-600">
                      정확도
                    </th>
                    <td className="px-3 py-2 text-slate-900">
                      {preview.accuracyM}m
                      {lowGpsAccuracy && (
                        <span className="mt-1 block text-xs font-medium text-amber-800">
                          정확도가 낮아 자동 감지 주소는 신뢰할 수 없습니다.
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-center text-sm font-medium text-slate-800">
              이 주소가 맞나요?
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={handleConfirmAddress}
                disabled={blockGpsConfirm}
                className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                맞습니다 — 이 주소로 등록
              </button>
              <button
                type="button"
                onClick={() => setStep("search")}
                className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {blockGpsConfirm ? "주소 검색 (권장)" : "아니요 — 주소 검색"}
              </button>
            </div>
          </div>
        )}

        {(preview && step === "search") || (addressSearchOnly && step === "search") ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-600">
              실제 도로명·지번을 입력하세요. (예: 매봉로2가길 3, 논현로 526)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSearch();
                }}
                placeholder="도로명 또는 지번 주소"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searchLoading}
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {searchLoading ? "검색..." : "검색"}
              </button>
            </div>
            {searchError && (
              <p className="text-xs text-amber-800">{searchError}</p>
            )}
            {searchResults.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {searchResults.map((hit, i) => (
                  <li key={`${hit.lat}-${hit.lon}-${i}`}>
                    <button
                      type="button"
                      onClick={() => handlePickAddress(hit)}
                      className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-emerald-50"
                    >
                      <span className="font-medium text-slate-900">
                        {hit.roadAddress || hit.address}
                      </span>
                      {hit.dong && (
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {hit.sido} {hit.sigungu} {hit.dong}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {preview && (
              <button
                type="button"
                onClick={() => setStep("gps")}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                ← GPS 감지 주소로 돌아가기
              </button>
            )}
          </div>
        ) : null}

        {activePreview && step === "confirm" && (
          <div className="mt-4 space-y-3">
            <div className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/50">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-emerald-100">
                    <th className="bg-emerald-50 px-3 py-2 text-left font-medium text-emerald-900">
                      등록 주소
                    </th>
                    <td className="px-3 py-2 font-medium text-emerald-950">
                      {activePreview.address}
                    </td>
                  </tr>
                  <tr className="border-b border-emerald-100">
                    <th className="bg-emerald-50 px-3 py-2 text-left font-medium text-emerald-900">
                      좌표
                    </th>
                    <td className="px-3 py-2 font-mono text-xs text-emerald-950">
                      {activePreview.lat.toFixed(7)}, {activePreview.lon.toFixed(7)}
                    </td>
                  </tr>
                  <tr>
                    <th className="bg-emerald-50 px-3 py-2 text-left font-medium text-emerald-900">
                      표시
                    </th>
                    <td className="px-3 py-2 text-emerald-950">
                      <span className="font-semibold text-emerald-800">
                        오차 없음 (사용자 확인)
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={() => onRegister(activePreview)}
                disabled={loading}
                className="rounded-xl bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow hover:bg-blue-700 disabled:opacity-60"
              >
                {loading ? "등록 중..." : "위치 등록 ← Click!!"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmedPreview(null);
                  setStep("gps");
                }}
                disabled={loading}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                주소 다시 선택
              </button>
            </div>
          </div>
        )}

        {clientIp && (
          <p className="mt-3 text-xs text-slate-500">
            등록 IP:{" "}
            <strong className="font-mono text-emerald-800">{clientIp}</strong>
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            [닫기]
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-950">
          * 주소를 등록하면 해당 창이 뜨지 않으며 검색기능을 이용하실 수
          있습니다.
          <br />* 사용자의 자발적인 IP·위치 정보만 수집합니다.
        </div>
      </div>
    </div>
  );
}
