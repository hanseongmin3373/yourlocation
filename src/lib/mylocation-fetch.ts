/**
 * mylocation.co.kr 공개 IP 검색 (WebForms)
 */

const BASE = "https://www.mylocation.co.kr/";
const FETCH_OPTS: RequestInit = {
  cache: "no-store",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ko-KR,ko;q=0.9",
  },
};

function parseHidden(html: string, name: string): string {
  const m = html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, "i"));
  return m?.[1] ?? "";
}

function parseLbAddr(html: string): string | null {
  const m = html.match(/id="lbAddr"[^>]*>([^<]*)</i);
  const text = m?.[1]?.trim().replace(/&nbsp;/g, " ") || "";
  return text.length > 1 ? text : null;
}

export type MylocationFetchResult = {
  ok: boolean;
  address: string | null;
  hint?: string;
};

export async function fetchMylocationAddress(
  ip: string,
): Promise<MylocationFetchResult> {
  try {
    const getRes = await fetch(BASE, { ...FETCH_OPTS, redirect: "follow" });
    const getHtml = await getRes.text();
    const beforeAddr = parseLbAddr(getHtml);
    const cookie = getRes.headers.getSetCookie?.()?.join("; ") || "";

    const body = new URLSearchParams({
      __EVENTTARGET: "",
      __EVENTARGUMENT: "",
      __VIEWSTATE: parseHidden(getHtml, "__VIEWSTATE"),
      __VIEWSTATEGENERATOR: parseHidden(getHtml, "__VIEWSTATEGENERATOR"),
      __EVENTVALIDATION: parseHidden(getHtml, "__EVENTVALIDATION"),
      txtAddr: ip,
      "btnAddr2.x": "12",
      "btnAddr2.y": "10",
    });

    const postHeaders: HeadersInit = {
      ...FETCH_OPTS.headers,
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: BASE,
      Origin: "https://www.mylocation.co.kr",
      ...(cookie ? { Cookie: cookie } : {}),
    };

    const postRes = await fetch(BASE, {
      method: "POST",
      headers: postHeaders,
      body: body.toString(),
      redirect: "follow",
      cache: "no-store",
    });
    const postHtml = await postRes.text();
    const address = parseLbAddr(postHtml);
    const submitted =
      postHtml.includes(`value="${ip}"`) ||
      postHtml.includes(`value='${ip}'`);

    if (!address) {
      return {
        ok: false,
        address: null,
        hint: submitted ? "empty lbAddr" : "search not applied",
      };
    }
    if (beforeAddr && address === beforeAddr) {
      return { ok: false, address: null, hint: "unchanged lbAddr (no DB hit)" };
    }

    return { ok: true, address: cleanMylocationAddress(address) };
  } catch {
    return { ok: false, address: null, hint: "fetch error" };
  }
}

/** 괄호 메모·공백 정리 */
export function cleanMylocationAddress(raw: string): string {
  return raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
