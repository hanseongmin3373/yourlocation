/**
 * mylocation ASP.NET WebForms IP search
 */
function parseHidden(html, name) {
  const m = html.match(
    new RegExp(`name="${name}"[^>]*value="([^"]*)"`, "i"),
  );
  return m?.[1] ?? "";
}

function parseLbAddr(html) {
  const m = html.match(/id="lbAddr"[^>]*>([^<]*)</i);
  const text = m?.[1]?.trim().replace(/&nbsp;/g, " ") || "";
  return text.length > 1 ? text : null;
}

export async function fetchMylocationIp(ip) {
  const base = "https://www.mylocation.co.kr/";
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "ko-KR,ko;q=0.9",
  };

  const getRes = await fetch(base, { headers, redirect: "follow" });
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

  const postHeaders = {
    ...headers,
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: base,
    Origin: "https://www.mylocation.co.kr",
  };
  if (cookie) postHeaders.Cookie = cookie;

  const postRes = await fetch(base, {
    method: "POST",
    headers: postHeaders,
    body: body.toString(),
    redirect: "follow",
  });
  const postHtml = await postRes.text();
  const address = parseLbAddr(postHtml);
  const submitted =
    postHtml.includes(`value="${ip}"`) ||
    postHtml.includes(`value='${ip}'`);
  if (!address) {
    return {
      address: null,
      ok: false,
      hint: submitted ? "empty lbAddr" : "search not applied",
    };
  }
  if (beforeAddr && address === beforeAddr) {
    return { address: null, ok: false, hint: "unchanged lbAddr (no DB hit)" };
  }
  return { address, ok: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.argv[1]?.includes("mylocation-search")) {
  const ip = process.argv[2] || "118.222.244.233";
  const r = await fetchMylocationIp(ip);
  console.log(JSON.stringify(r, null, 2));
}
