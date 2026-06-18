const GPS_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 28000,
  maximumAge: 0,
};

const FAST_GPS_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 6000,
  maximumAge: 120_000,
};

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

    const finish = (watchId: number) => {
      navigator.geolocation.clearWatch(watchId);
      if (best) resolve(best);
      else reject(new Error("GPS 좌표를 가져올 수 없습니다."));
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
        if (best) resolve(best);
        else reject(new Error(gpsErrorMessage(err)));
      },
      opts,
    );

    setTimeout(() => finish(watchId), maxWaitMs);
  });
}

/** 다중 GPS 샘플 중 최고 정밀 좌표 선택 */
export function getUltraPrecisePosition(): Promise<GeolocationPosition> {
  return watchBestPosition(GPS_OPTS, 6, 18, 26000);
}

/** 백그라운드 GPS — IP 결과 표시 후 정밀 보정용 (최대 ~6초) */
export function getFastGpsPosition(): Promise<GeolocationPosition> {
  return watchBestPosition(FAST_GPS_OPTS, 2, 30, 6000);
}

export function gpsAccuracyM(pos: GeolocationPosition): number {
  return Math.max(3, Math.round((pos.coords.accuracy ?? 20) * 10) / 10);
}

export function formatPreciseCoord(n: number, decimals = 7): string {
  return n.toFixed(decimals);
}

function gpsErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return "위치 권한을 허용해주세요.";
  }
  if (err.code === err.TIMEOUT) {
    return "GPS 신호 수신 시간이 초과되었습니다.";
  }
  return "위치를 가져올 수 없습니다.";
}
