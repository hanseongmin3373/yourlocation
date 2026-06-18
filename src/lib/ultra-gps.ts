const GPS_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 12000,
  maximumAge: 30_000,
};

const FAST_GPS_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 6000,
  maximumAge: 120_000,
};

const REGISTER_GPS_ATTEMPTS: PositionOptions[] = [
  { enableHighAccuracy: true, timeout: 7000, maximumAge: 60_000 },
  { enableHighAccuracy: false, timeout: 7000, maximumAge: 300_000 },
  { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
];

function getCurrentPositionOnce(
  opts: PositionOptions,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 서비스를 지원하지 않습니다."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => reject(new Error(gpsErrorMessage(err))),
      opts,
    );
  });
}

function watchBestPosition(
  opts: PositionOptions,
  targetSamples: number,
  targetAccuracyM: number,
  maxWaitMs: number,
): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("이 브라우저는 위치 서비스를 지원하지 않습니다."));
      return;
    }

    let best: GeolocationPosition | null = null;
    let samples = 0;
    let settled = false;

    const settle = (result: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const finish = (watchId: number) => {
      navigator.geolocation.clearWatch(watchId);
      if (best) {
        settle(best);
        return;
      }
      void getCurrentPositionOnce({
        enableHighAccuracy: opts.enableHighAccuracy ?? true,
        timeout: Math.min(opts.timeout ?? 8000, 8000),
        maximumAge: opts.maximumAge ?? 120_000,
      })
        .then(settle)
        .catch((err) =>
          fail(err instanceof Error ? err.message : "GPS 좌표를 가져올 수 없습니다."),
        );
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        samples += 1;
        const acc = pos.coords.accuracy ?? 9999;
        if (!best || acc < (best.coords.accuracy ?? 9999)) {
          best = pos;
        }
        if (acc <= targetAccuracyM || samples >= targetSamples) {
          finish(watchId);
        }
      },
      (err) => {
        navigator.geolocation.clearWatch(watchId);
        if (best) {
          settle(best);
          return;
        }
        void getCurrentPositionOnce({
          enableHighAccuracy: opts.enableHighAccuracy ?? true,
          timeout: 8000,
          maximumAge: opts.maximumAge ?? 120_000,
        })
          .then(settle)
          .catch(() => fail(gpsErrorMessage(err)));
      },
      opts,
    );

    setTimeout(() => finish(watchId), maxWaitMs);
  });
}

/** 등록 모달 — 빠른 GPS (단계별 fallback, 보통 7초 이내) */
export async function getRegisterGpsPosition(): Promise<GeolocationPosition> {
  let lastMessage = "GPS 좌표를 가져올 수 없습니다.";

  for (const opts of REGISTER_GPS_ATTEMPTS) {
    try {
      return await getCurrentPositionOnce(opts);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "GPS 좌표를 가져올 수 없습니다.";
      if (message.includes("권한")) {
        throw err;
      }
      lastMessage = message;
    }
  }

  throw new Error(lastMessage);
}

/** 다중 GPS 샘플 중 최고 정밀 좌표 선택 */
export function getUltraPrecisePosition(): Promise<GeolocationPosition> {
  return watchBestPosition(GPS_OPTS, 4, 25, 14000);
}

/** 백그라운드 GPS — IP 결과 표시 후 정밀 보정용 */
export function getFastGpsPosition(): Promise<GeolocationPosition> {
  return watchBestPosition(FAST_GPS_OPTS, 2, 35, 6000);
}

export function gpsAccuracyM(pos: GeolocationPosition): number {
  return Math.max(3, Math.round((pos.coords.accuracy ?? 20) * 10) / 10);
}

export function formatPreciseCoord(n: number, decimals = 7): string {
  return n.toFixed(decimals);
}

function gpsErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return "위치 권한을 허용해주세요. 브라우저 주소창 옆 자물쇠에서 위치를 허용할 수 있습니다.";
  }
  if (err.code === err.TIMEOUT) {
    return "GPS 신호 수신 시간이 초과되었습니다. Wi-Fi·GPS를 켠 뒤 다시 시도해 주세요.";
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return "GPS 신호를 받을 수 없습니다. 실외 또는 Wi-Fi 연결 후 다시 시도해 주세요.";
  }
  return "GPS 좌표를 가져올 수 없습니다.";
}
