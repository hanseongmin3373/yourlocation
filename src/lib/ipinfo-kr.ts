import { sanitizeGeoText } from "./geo-field-sanitize";

/** ipinfo 영문 지역명 → 한국어 */
export const KR_REGION_TO_KO: Record<string, string> = {
  Seoul: "서울특별시",
  Busan: "부산광역시",
  Daegu: "대구광역시",
  Incheon: "인천광역시",
  Gwangju: "광주광역시",
  Daejeon: "대전광역시",
  Ulsan: "울산광역시",
  Sejong: "세종특별자치시",
  "Gyeonggi-do": "경기도",
  Gyeonggi: "경기도",
  "Gangwon-do": "강원특별자치도",
  Gangwon: "강원특별자치도",
  "Chungcheongbuk-do": "충청북도",
  "Chungcheongnam-do": "충청남도",
  "Jeollabuk-do": "전북특별자치도",
  "Jeollanam-do": "전라남도",
  "Gyeongsangbuk-do": "경상북도",
  "Gyeongsangnam-do": "경상남도",
  "Jeju-do": "제주특별자치도",
  Jeju: "제주특별자치도",
};

/** 행정구역 코드 → 시도 */
export const KR_REGION_CODE_TO_SIDO: Record<string, string> = {
  "11": "서울특별시",
  "26": "부산광역시",
  "27": "대구광역시",
  "28": "인천광역시",
  "29": "광주광역시",
  "30": "대전광역시",
  "31": "울산광역시",
  "36": "세종특별자치시",
  "41": "경기도",
  "42": "강원특별자치도",
  "43": "충청북도",
  "44": "충청남도",
  "45": "전북특별자치도",
  "46": "전라남도",
  "47": "경상북도",
  "48": "경상남도",
  "50": "제주특별자치도",
};

export const KR_CITY_TO_KO: Record<string, string> = {
  Seoul: "서울",
  Seongnam: "성남시",
  "Seongnam-si": "성남시",
  Uijeongbu: "의정부시",
  "Uijeongbu-si": "의정부시",
  Pocheon: "포천시",
  "Pocheon-si": "포천시",
  Suwon: "수원시",
  Goyang: "고양시",
  Bucheon: "부천시",
  Ansan: "안산시",
  Anyang: "안양시",
  Namyangju: "남양주시",
  Hwaseong: "화성시",
  Cheonan: "천안시",
  Jeonju: "전주시",
  Cheongju: "청주시",
  Changwon: "창원시",
  Pohang: "포항시",
  Jeju: "제주시",
  Gangnam: "강남구",
  Mapo: "마포구",
  Jongno: "종로구",
  Jung: "중구",
  Seocho: "서초구",
  Songpa: "송파구",
  Gangdong: "강동구",
  Gwanak: "관악구",
  Yeongdeungpo: "영등포구",
  Gangseo: "강서구",
  Yangcheon: "양천구",
  Guro: "구로구",
  Geumcheon: "금천구",
  Dongjak: "동작구",
  Eunpyeong: "은평구",
  Seodaemun: "서대문구",
  Nowon: "노원구",
  Dobong: "도봉구",
  Gangbuk: "강북구",
  Seongbuk: "성북구",
  Jungnang: "중랑구",
  Dongdaemun: "동대문구",
  Sangdo: "상도동",
  Guri: "구리시",
  "Guri-si": "구리시",
  "Banpo-dong": "반포동",
  "Banpo": "반포동",
};

/** 광역시명만 있고 구/군이 없는 경우 */
export function isMetroOnlyCity(region?: string, city?: string): boolean {
  if (!region && !city) return false;
  const r = (region || "").trim();
  const c = (city || "").trim();
  if (!c) return true;
  if (r === c) return true;
  const rKo = mapRegionToKorean(r);
  const cKo = mapCityToKorean(c);
  if (rKo && cKo === rKo) return true;
  const metroNames = [
    "Seoul",
    "Busan",
    "Daejeon",
    "Daegu",
    "Incheon",
    "Gwangju",
    "Ulsan",
    "서울",
    "부산",
    "대전",
    "대구",
    "인천",
    "광주",
    "울산",
  ];
  return metroNames.includes(c) || metroNames.includes(cKo);
}

/** 영문 구/군 (Gangnam-gu 등) */
export const KR_DISTRICT_TO_KO: Record<string, string> = {
  "Gangnam-gu": "강남구",
  "Mapo-gu": "마포구",
  "Jongno-gu": "종로구",
  "Jung-gu": "중구",
  "Seocho-gu": "서초구",
  "Songpa-gu": "송파구",
  "Gangdong-gu": "강동구",
  "Gwanak-gu": "관악구",
  "Yeongdeungpo-gu": "영등포구",
  "Gangseo-gu": "강서구",
  "Yangcheon-gu": "양천구",
  "Guro-gu": "구로구",
  "Geumcheon-gu": "금천구",
  "Dongjak-gu": "동작구",
  "Eunpyeong-gu": "은평구",
  "Seodaemun-gu": "서대문구",
  "Nowon-gu": "노원구",
  "Dobong-gu": "도봉구",
  "Gangbuk-gu": "강북구",
  "Seongbuk-gu": "성북구",
  "Jungnang-gu": "중랑구",
  "Dongdaemun-gu": "동대문구",
  "Yongsan-gu": "용산구",
  "Gangnam": "강남구",
  "Bundang-gu": "분당구",
  "Uijeongbu-dong": "의정부동",
  "Paldal-gu": "팔달구",
  "Giheung-gu": "기흥구",
  "Suji-gu": "수지구",
  "Cheoin-gu": "처인구",
  "Gwangjin-gu": "광진구",
  "Seo-gu": "서구",
  "Dong-gu": "동구",
  "Nam-gu": "남구",
  "Buk-gu": "북구",
  "Banpo-dong": "반포동",
};

/** 동·읍·면 수준 이름 (시·군·구가 아님) */
export function isDongLevelName(name?: string): boolean {
  if (!name) return false;
  const c = sanitizeGeoText(name);
  if (!c) return false;
  if (/-dong$/i.test(c) || /-eup$/i.test(c) || /-myeon$/i.test(c)) return true;
  const compact = c.replace(/\s/g, "");
  if (/동$/.test(compact) && !/(특별시|광역시|시|군|구)$/.test(compact)) {
    return compact.length <= 6 || /[가-힣]+동$/.test(compact);
  }
  return false;
}

export function translateDistrictName(name: string): string {
  const trimmed = name.trim();
  if (KR_DISTRICT_TO_KO[trimmed]) return KR_DISTRICT_TO_KO[trimmed];
  if (KR_CITY_TO_KO[trimmed]) return KR_CITY_TO_KO[trimmed];

  const guMatch = /^([A-Za-z]+)-gu$/i.exec(trimmed);
  if (guMatch) {
    const base = guMatch[1];
    const mapped = KR_CITY_TO_KO[base];
    if (mapped) return mapped.endsWith("구") ? mapped : `${mapped}구`;
  }

  return trimmed;
}

export function mapRegionToKorean(region?: string): string {
  if (!region) return "";
  const r = sanitizeGeoText(region);
  if (!r) return "";
  if (KR_REGION_TO_KO[r]) return KR_REGION_TO_KO[r];

  const stripped = r.replace(
    /-(gwangyeoksi|teukbyeolsi|teukbyeol-jachisi|do|si)$/i,
    "",
  );
  if (stripped !== r && KR_REGION_TO_KO[stripped]) {
    return KR_REGION_TO_KO[stripped];
  }
  if (/gwangyeoksi$/i.test(r)) {
    const ko = KR_REGION_TO_KO[stripped];
    if (ko) return ko;
  }
  if (/teukbyeolsi$/i.test(r)) {
    const ko = KR_REGION_TO_KO[stripped];
    if (ko) return ko;
  }

  return r;
}

export function mapCityToKorean(city?: string): string {
  if (!city) return "";
  const c = sanitizeGeoText(city);
  if (!c) return "";
  return (
    KR_DISTRICT_TO_KO[c] ||
    KR_CITY_TO_KO[c] ||
    translateDistrictName(c) ||
    c
  );
}

/** db-ip city 필드 파싱 — 예: "Uijeongbu-si (Uijeongbu-dong)" */
export function parseDbIpCityHints(city?: string): {
  sigungu: string;
  dong?: string;
} {
  const cleaned = sanitizeGeoText(city);
  if (!cleaned) return { sigungu: "" };

  if (isDongLevelName(cleaned)) {
    const dong =
      translateDistrictName(cleaned) ||
      mapCityToKorean(cleaned) ||
      cleaned;
    return { sigungu: "", dong };
  }

  const trimmed = cleaned;
  const paren = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(trimmed);
  if (paren) {
    const sigungu = mapCityToKorean(paren[1].trim()) || paren[1].trim();
    const dongRaw = paren[2].trim();
    const dong =
      translateDistrictName(dongRaw) ||
      mapCityToKorean(dongRaw) ||
      dongRaw;
    return { sigungu, dong: dong !== sigungu ? dong : undefined };
  }
  return { sigungu: mapCityToKorean(trimmed) || trimmed };
}

export function buildKoreanAddressQuery(
  region?: string,
  city?: string,
  postal?: string,
): string | null {
  const parts: string[] = [];
  const sido = mapRegionToKorean(region);
  const sigungu = mapCityToKorean(city);

  if (sido) parts.push(sido);
  if (sigungu && !parts.some((p) => p.includes(sigungu) || sigungu.includes(p))) {
    parts.push(sigungu);
  }
  if (postal?.trim()) parts.push(postal.trim());

  const query = parts.filter(Boolean).join(" ");
  return query.length >= 2 ? query : null;
}

/** 초정밀 모드: 가능한 모든 한국어 주소 검색 쿼리 생성 */
export function buildAllKoreanQueries(input: {
  region?: string;
  city?: string;
  zip?: string;
  regionCode?: string;
}): string[] {
  const seen = new Set<string>();
  const add = (q: string | null) => {
    if (!q || q.length < 2) return;
    const key = q.replace(/\s+/g, " ").trim();
    if (!seen.has(key)) seen.add(key);
  };

  const sidoFromCode = input.regionCode
    ? KR_REGION_CODE_TO_SIDO[input.regionCode.replace(/\D/g, "").slice(0, 2)]
    : undefined;
  const sido = mapRegionToKorean(input.region) || sidoFromCode || "";
  const sigungu = mapCityToKorean(input.city);

  if (input.zip && input.zip.length >= 5) {
    add(input.zip);
    if (sido) add(`${sido} ${input.zip}`);
  }

  if (isMetroOnlyCity(input.region, input.city) && sido && input.zip) {
    add(`${sido} ${input.zip}`);
  }

  add(buildKoreanAddressQuery(input.region, input.city, input.zip));
  add(buildKoreanAddressQuery(input.region, input.city));
  if (sido && sigungu) add(`${sido} ${sigungu}`);
  if (sido && input.zip) add(`${sido} ${input.zip}`);
  if (sigungu && input.zip) add(`${sigungu} ${input.zip}`);
  if (sidoFromCode && sigungu) add(`${sidoFromCode} ${sigungu}`);
  if (input.zip && input.zip.length >= 5) add(input.zip);
  if (sigungu) add(sigungu);
  if (sido) add(sido);

  return [...seen];
}
