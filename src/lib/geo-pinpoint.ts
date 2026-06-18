/** 한국 IP 핀포인트 — 카카오 주소 좌표만 사용, 오차 반경 없음 */

export type PinpointMeta = {
  exactPin: boolean;
  precisionScore: number;
  addressSource: string;
};

export function buildPinpointNote(
  sources: string[],
  addressSource: string,
): string {
  const parts = ["주소 좌표 고정"];
  if (sources.length > 0) {
    parts.push(`참조: ${sources.join(" + ")}`);
  }
  if (addressSource.startsWith("search:")) {
    parts.push("카카오 주소 검색 매칭");
  } else if (addressSource === "coord2address") {
    parts.push("카카오 역지오코딩");
  }
  return parts.join(" · ");
}

export function isPinpointResult(score: number, hasDong: boolean): boolean {
  return score >= 52 && hasDong;
}
