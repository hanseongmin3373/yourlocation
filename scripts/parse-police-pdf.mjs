/**
 * 경찰청 직제 시행규칙 [별표 2] PDF → 경찰서 DB 파싱
 */

const OFFICE_REGIONS = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "강원도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라북도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도",
];

const CITY_PREFIX = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
};

function joinSpacedHangul(line) {
  const tokens = line.split(/\s+/);
  if (tokens.length < 2) return line;
  let i = 0;
  while (i < tokens.length && tokens[i].length === 1 && /[가-힣]/.test(tokens[i])) {
    i++;
  }
  if (i < 2) return line;
  const joined = tokens.slice(0, i).join("");
  const rest = tokens.slice(i).join(" ");
  return rest ? `${joined} ${rest}` : joined;
}

export function normalizePdfText(raw) {
  return raw
    .replace(/--\s*\d+\s+of\s+\d+\s+--/g, "\n")
    .replace(/[■·]/g, " ")
    .split("\n")
    .map((line) => joinSpacedHangul(line.replace(/\t+/g, " ").replace(/\s+/g, " ").trim()))
    .filter(Boolean)
    .join("\n");
}

function compact(s) {
  return s.replace(/\s/g, "");
}

function isPoliceServerMarker(line) {
  return compact(line) === "경찰서";
}

function isOfficeHeader(line) {
  const c = compact(line);
  return c.endsWith("경찰청") || OFFICE_REGIONS.includes(c);
}

function isNextStationMarker(lines, idx) {
  const c = compact(lines[idx] ?? "");
  return (
    /^[가-힣0-9]{2,20}$/.test(c) &&
    isPoliceServerMarker(lines[idx + 1] ?? "") &&
    !/명칭|위치|관할구역|시도경찰청/.test(c)
  );
}

function stripTrailingAdmin(text, sigungu) {
  let out = text;
  for (const part of sigungu.split(" ").map(compact).sort((a, b) => b.length - a.length)) {
    if (out.endsWith(part) && out.length > part.length) {
      out = out.slice(0, -part.length);
    }
  }
  return out;
}

function splitAddressJurisdiction(line) {
  const m = line.match(/^([가-힣]+동\s+\d+(?:-\d+)?)\s+((?:[가-힣]+(?:동|읍|면)).+)$/);
  if (m) {
    return {
      address: compact(m[1]),
      jurisdiction: m[2].trim(),
    };
  }
  return null;
}

function isJurisdictionLine(line, sigungu, hasRoad) {
  const c = compact(line);
  const sg = compact(sigungu);

  if (sg && (c.includes(`${sg}중`) || /\s중\s/.test(line))) return true;
  if (/^[가-힣]+동[,，]/.test(line.trim())) return true;
  if (/^[가-힣]+(?:읍|면)[,，]/.test(line.trim())) return true;
  if (hasRoad && /제외한다|제외한/.test(line)) return true;
  if (hasRoad && /^[가-힣]+(?:시|군|구)[(,，]/.test(c)) return true;
  if (hasRoad && /^[가-힣]+(?:시|군|구)\(/.test(c)) return true;
  return false;
}

function parseDongs(jurisdictionText, sigungu) {
  const dongs = new Set();
  if (!jurisdictionText) return dongs;

  let text = jurisdictionText.replace(/\s+/g, "");
  const sg = sigungu.replace(/\s/g, "");
  text = text.replace(new RegExp(`^${sg}중`), "");
  text = text.replace(new RegExp(`^${sg}`), "");

  for (const part of text.split(/[,，]/)) {
    const token = part.trim();
    if (!token || /일부|제외|부터|까지|\(/.test(token)) continue;
    const m = token.match(/([가-힣0-9·]+(?:동|가|읍|면|리))/);
    if (m) dongs.add(m[1]);
  }
  return dongs;
}

function readSigungu(lines, startIdx) {
  let i = startIdx;
  const parts = [];
  let roadPrefix = "";

  while (i < lines.length) {
    const l = lines[i];
    if (isNextStationMarker(lines, i) || isOfficeHeader(l)) break;
    const c = compact(l);

    if (/^[가-힣]+(?:시|군|구)$/.test(c)) {
      parts.push(c);
      i++;
      continue;
    }

    const adminWithRest = l.match(/^([가-힣]+(?:시|군|구))\s+(.+)$/);
    if (adminWithRest) {
      parts.push(compact(adminWithRest[1]));
      roadPrefix = adminWithRest[2];
      i++;
      break;
    }

    const cityWithRoad = l.match(/^([가-힣]+시)\s+(.+)$/);
    if (cityWithRoad && parts.length === 0) {
      parts.push(compact(cityWithRoad[1]));
      roadPrefix = cityWithRoad[2];
      i++;
      break;
    }

    if (/^[가-힣]+(?:읍|면)$/.test(c) && parts.length > 0) {
      parts.push(c);
      i++;
      continue;
    }

    if (/^[가-힣]+동\s+\d/.test(l) && parts.length === 0) {
      return {
        sigungu: "세종특별자치시",
        roadPrefix: l,
        next: i,
        combinedAddressJurisdiction: true,
      };
    }

    if (/^[가-힣]+읍$/.test(c) && parts.length === 0) {
      return {
        sigungu: "세종특별자치시",
        roadPrefix: c,
        next: i + 1,
      };
    }

    break;
  }

  return { sigungu: parts.join(" "), roadPrefix, next: i };
}

function readRoad(lines, startIdx, sigungu, roadPrefix = "") {
  let i = startIdx;
  const chunks = [];
  if (roadPrefix) {
    chunks.push(compact(roadPrefix));
  }
  const sgParts = sigungu.split(" ").map(compact).filter(Boolean);

  while (i < lines.length) {
    const l = lines[i];
    let c = compact(l);

    if (isNextStationMarker(lines, i)) break;
    if (isJurisdictionLine(l, sigungu, chunks.length > 0)) break;

    for (const part of [...sgParts].sort((a, b) => b.length - a.length)) {
      if (c.endsWith(part) && c.length > part.length) {
        c = c.slice(0, -part.length);
        break;
      }
    }

    if (/^로\d/.test(compact(lines[i + 1] ?? "")) && /^[가-힣]+$/.test(c)) {
      chunks.push(c);
      i++;
      continue;
    }

    if (/^로\d/.test(c) && chunks.length > 0) {
      chunks[chunks.length - 1] += c;
      i++;
      continue;
    }

    const isRoadLike =
      /로|길|대로|번길/.test(c) ||
      /^\d/.test(c) ||
      (chunks.length > 0 && !/^[가-힣]+(?:시|군|구|읍|면)$/.test(c));

    if (isRoadLike && !sgParts.includes(c)) {
      chunks.push(c);
      i++;
      continue;
    }

    if (sgParts.includes(c)) {
      i++;
      break;
    }

    if (chunks.length > 0) break;
    i++;
  }

  let road = chunks.join("");
  road = stripTrailingAdmin(road, sigungu);
  return { road, next: i };
}

function readJurisdiction(lines, startIdx, sigungu) {
  let i = startIdx;
  const parts = [];

  while (i < lines.length) {
    const l = lines[i];
    if (isNextStationMarker(lines, i)) break;
    if (isOfficeHeader(l) && !l.includes("경찰서")) break;

    parts.push(l);
    i++;

    if (parts.length > 0) {
      const joined = parts.join(" ");
      if (
        joined.includes("동,") ||
        joined.includes("동 ") ||
        joined.includes("가,") ||
        joined.includes("읍,") ||
        joined.includes("면,") ||
        joined.length > 200
      ) {
        if (isNextStationMarker(lines, i)) break;
      }
    }
  }

  return { jurisdiction: parts.join(" ").trim(), next: i };
}

export function formatRoadAddress(road) {
  if (!road) return "";
  return road
    .replace(/([가-힣]+(?:대로|로))(\d)/g, "$1 $2")
    .replace(/([가-힣]+길)(\d)/g, "$1 $2")
    .replace(/(\d+번길)(\d)/g, "$1 $2")
    .replace(/(\D)(\d+)(-\d+)$/g, "$1 $2$3")
    .replace(/\s+/g, " ")
    .trim();
}

function buildAddress(sigungu, road) {
  const sg = sigungu.replace(/\s+/g, " ").trim();
  const r = formatRoadAddress(stripTrailingAdmin(road.trim(), sigungu));
  if (!r) return sg;
  if (compact(r).startsWith(compact(sg))) {
    return `${sg} ${r.slice(compact(sg).length).trim()}`.trim();
  }
  return `${sg} ${r}`
    .replace(/(읍|면|동)([가-힣])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/** Kakao 지오코딩용 주소 후보 */
export function geocodeAddressCandidates(station) {
  const cityKey = station.name.match(/^(서울|부산|대구|인천|광주|대전|울산|세종)/)?.[1];
  const city = cityKey ? CITY_PREFIX[cityKey] : "";
  const base = station.address.replace(/\s+/g, " ").trim();
  const road = formatRoadAddress(station.roadAddress || "");
  const sigungu = station.sigungu?.replace(/\s+/g, " ").trim() ?? "";
  const queries = new Set();
  if (city) queries.add(`${city} ${base}`);
  queries.add(base);
  if (road && sigungu) {
    if (city) queries.add(`${city} ${sigungu} ${road}`);
    queries.add(`${sigungu} ${road}`);
  }
  queries.add(`${station.name.replace("경찰서", "")} 경찰서`);
  return [...queries].filter(Boolean);
}

/** @returns {import('./parse-police-pdf.mjs').PolicePdfStation[]} */
export function parsePolicePdfText(rawText) {
  const lines = normalizePdfText(rawText).split("\n");
  const stations = [];
  let office = "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const c = compact(line);

    if (c.endsWith("경찰청")) {
      office = c;
      i++;
      continue;
    }

    if (isNextStationMarker(lines, i)) {
      const name = `${c}경찰서`;
      i += 2;

      const sg = readSigungu(lines, i);
      i = sg.next;

      let jurisdictionRaw = "";
      let rd = { road: "", next: i };

      if (sg.combinedAddressJurisdiction) {
        const split = splitAddressJurisdiction(sg.roadPrefix);
        if (split) {
          rd = { road: split.address, next: i + 1 };
          jurisdictionRaw = split.jurisdiction;
          const jur = readJurisdiction(lines, rd.next, sg.sigungu);
          if (jur.jurisdiction) {
            jurisdictionRaw = `${jurisdictionRaw} ${jur.jurisdiction}`.trim();
          }
          i = jur.next;
        } else {
          rd = readRoad(lines, i, sg.sigungu, sg.roadPrefix);
          const jur = readJurisdiction(lines, rd.next, sg.sigungu);
          jurisdictionRaw = jur.jurisdiction;
          i = jur.next;
        }
      } else {
        rd = readRoad(lines, i, sg.sigungu, sg.roadPrefix);
        const jur = readJurisdiction(lines, rd.next, sg.sigungu);
        jurisdictionRaw = jur.jurisdiction;
        i = jur.next;
      }

      if (!jurisdictionRaw && sg.sigungu) {
        jurisdictionRaw = sg.sigungu;
      }

      const dongs = [...parseDongs(jurisdictionRaw, sg.sigungu)];

      stations.push({
        name,
        office,
        sigungu: sg.sigungu,
        address: buildAddress(sg.sigungu, rd.road),
        roadAddress: rd.road || buildAddress(sg.sigungu, rd.road),
        jurisdictionRaw,
        jurisdictionDongs: dongs,
        type: "station",
        source: "police-ordinance-pdf",
      });
      continue;
    }

    i++;
  }

  return stations.filter(
    (s) =>
      s.sigungu &&
      s.name.endsWith("경찰서") &&
      !/명칭|위치|관할구역|시도경찰청/.test(s.name),
  );
}

function extractGuName(sigungu) {
  if (!sigungu) return "";
  const trimmed = sigungu.trim();
  const match = trimmed.match(/([가-힣0-9]+(?:구|군|시))\s*$/);
  if (match) return compact(match[1]);
  return compact(trimmed);
}

function guNameStem(guNorm) {
  return guNorm.replace(/(특별자치시|특별자치도|특별시|광역시|구|군|시)$/u, "");
}

function sigunguMatches(stationGu, userGu) {
  if (!stationGu || !userGu) return false;
  return (
    stationGu === userGu ||
    userGu.includes(stationGu) ||
    stationGu.includes(userGu)
  );
}

const SIDO_STATION_PREFIX = {
  서울특별시: "서울",
  부산광역시: "부산",
  대구광역시: "대구",
  인천광역시: "인천",
  광주광역시: "광주",
  대전광역시: "대전",
  울산광역시: "울산",
  세종특별자치시: "세종",
  제주특별자치도: "제주",
};

function sidoToStationPrefix(sido) {
  if (!sido) return null;
  const c = compact(sido);
  for (const [key, prefix] of Object.entries(SIDO_STATION_PREFIX)) {
    if (c.includes(compact(key))) return prefix;
  }
  const m = sido.match(/^([가-힣]{2,4})/);
  return m?.[1] ?? null;
}

function stationInGu(station, guNorm) {
  const sGu = extractGuName(station.sigungu);
  if (sigunguMatches(sGu, guNorm)) return true;
  const raw = compact(station.jurisdictionRaw ?? "");
  if (raw === guNorm) return true;
  const stem = guNameStem(guNorm);
  return (
    stem.length >= 2 &&
    station.name.includes(stem) &&
    station.name.endsWith("경찰서")
  );
}

export function matchJurisdictionStation(stations, opts) {
  const guNorm = extractGuName(opts.sigungu);
  const dongNorm = opts.dong ? compact(opts.dong) : "";
  if (!guNorm && !dongNorm) return null;

  const cityPrefix = sidoToStationPrefix(opts.sido);
  const official = stations.filter((s) => s.type === "station");
  const candidates = cityPrefix
    ? official.filter((s) => s.name.startsWith(cityPrefix))
    : official;

  const inGu = guNorm
    ? candidates.filter((s) => stationInGu(s, guNorm))
    : candidates;

  if (dongNorm && inGu.length > 1) {
    for (const s of inGu) {
      if (s.jurisdictionDongs?.includes(dongNorm)) return s;
    }
    for (const s of inGu) {
      if (s.jurisdictionRaw?.replace(/\s/g, "").includes(dongNorm)) return s;
    }
  }

  if (guNorm && inGu.length === 1) return inGu[0];

  if (guNorm) {
    const wholeDistrict = inGu.filter(
      (s) => compact(s.jurisdictionRaw ?? "") === guNorm,
    );
    if (wholeDistrict.length === 1) return wholeDistrict[0];

    const stem = guNameStem(guNorm);
    if (stem.length >= 2) {
      const byName = inGu.filter(
        (s) => s.name.includes(stem) && s.name.endsWith("경찰서"),
      );
      if (byName.length === 1) return byName[0];
    }
  }

  if (dongNorm) {
    for (const s of candidates) {
      if (guNorm && !stationInGu(s, guNorm)) continue;
      if (s.jurisdictionDongs?.includes(dongNorm)) return s;
    }
    for (const s of candidates) {
      if (guNorm && !stationInGu(s, guNorm)) continue;
      if (s.jurisdictionRaw?.replace(/\s/g, "").includes(dongNorm)) return s;
    }
  }

  return null;
}
