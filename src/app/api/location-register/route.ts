import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/client-ip";
import {
  eraseCrowdLocation,
  registerCrowdLocation,
} from "@/lib/crowd-ip-db";
import { formatAppliedAddress } from "@/lib/coord-validation";
import { buildVerifiedRegistration } from "@/lib/gps-address-verify";
import { resolveAddressFromCoords } from "@/lib/kakao-geocode";

export const dynamic = "force-dynamic";

/** GPS+IP 위치 DB 등록 — 조회 한도 차감 없음 */
export async function POST(request: NextRequest) {
  try {
    const clientIp = getClientIp(request.headers);
    if (!clientIp || clientIp === "unknown") {
      return NextResponse.json(
        { success: false, error: "접속 IP를 확인할 수 없습니다." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      lat?: number;
      lng?: number;
      lon?: number;
      accuracyM?: number;
      address?: string;
      appliedAddress?: string;
      roadAddress?: string;
      dong?: string;
      sido?: string;
      sigungu?: string;
      isp?: string;
      source?: string;
      userVerified?: boolean;
    };

    const lat = body.lat;
    const lon = body.lon ?? body.lng;
    const userVerified = Boolean(body.userVerified);

    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json(
        { success: false, error: "위도·경도가 필요합니다." },
        { status: 400 },
      );
    }

    const accuracyM = Math.max(3, body.accuracyM ?? 30);

    let address = body.address?.trim() || "";
    let dong = body.dong;
    let sido = body.sido;
    let sigungu = body.sigungu;
    let roadAddress = body.roadAddress?.trim() || "";

    if (!address) {
      const detail = await resolveAddressFromCoords(lat, lon);
      if (detail) {
        address = detail.road || detail.full;
        roadAddress = roadAddress || detail.road || detail.full;
        dong = dong || detail.dong;
        sido = sido || detail.sido;
        sigungu = sigungu || detail.sigungu;
      } else {
        address = `${lat.toFixed(7)}, ${lon.toFixed(7)}`;
      }
    }

    let appliedAddress =
      body.appliedAddress?.trim() ||
      formatAppliedAddress(sido, sigungu, dong) ||
      address;

    let registerLat = lat;
    let registerLon = lon;
    let registerAccuracy = accuracyM;

    if (userVerified) {
      const verified = buildVerifiedRegistration(
        {
          lat,
          lon,
          address,
          roadAddress: roadAddress || address,
          dong,
          sido,
          sigungu,
        },
        accuracyM,
      );
      registerLat = verified.lat;
      registerLon = verified.lon;
      registerAccuracy = verified.accuracyM;
      address = verified.address;
      roadAddress = verified.roadAddress;
      appliedAddress = verified.appliedAddress;
    }

    const result = await registerCrowdLocation({
      ip: clientIp,
      lat: registerLat,
      lon: registerLon,
      accuracyM: registerAccuracy,
      address,
      appliedAddress: userVerified ? address : appliedAddress,
      dong,
      sido,
      sigungu,
      roadAddress: roadAddress || address,
      isp: body.isp,
      source: body.source || (userVerified ? "user-verified" : "gps-register"),
      userVerified,
    });

    return NextResponse.json({
      success: true,
      appliedAddress: result.appliedAddress,
      totalCount: result.totalCount,
      isUpdate: result.isUpdate,
      address,
      dong: dong ?? "",
      sido: sido ?? "",
      sigungu: sigungu ?? "",
      userVerified,
    });
  } catch (error) {
    console.error("location-register error", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "위치 등록에 실패했습니다.",
      },
      { status: 500 },
    );
  }
}

/** 본인 IP 등록 데이터 삭제 */
export async function DELETE(request: NextRequest) {
  const clientIp = getClientIp(request.headers);
  if (!clientIp || clientIp === "unknown") {
    return NextResponse.json(
      { success: false, error: "접속 IP를 확인할 수 없습니다." },
      { status: 400 },
    );
  }

  const erased = await eraseCrowdLocation(clientIp);
  return NextResponse.json({
    success: true,
    erased,
    message: erased
      ? "등록된 위치 데이터가 삭제되었습니다."
      : "삭제할 등록 데이터가 없습니다.",
  });
}
