#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function decodeCsvBuffer(buf) {
  for (const enc of ["utf-8", "euc-kr", "cp949"]) {
    try {
      const text = new TextDecoder(enc).decode(buf);
      if (text.includes("경찰") || text.includes("주소") || text.includes("시도")) {
        return { text, enc };
      }
    } catch {
      /* next */
    }
  }
  return { text: buf.toString("utf8"), enc: "utf-8" };
}

async function downloadBestCsv(atchFileId, maxSn = 5) {
  for (let sn = 1; sn <= maxSn; sn++) {
    const dl = `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=${atchFileId}&fileDetailSn=${sn}&insertDataPrcus=N`;
    const buf = Buffer.from(
      await (await fetch(dl, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer(),
    );
    if (buf.length < 100 || buf[0] === 0xff && buf[1] === 0xd8) continue;
    const { text, enc } = decodeCsvBuffer(buf);
    if (text.includes(",") && (text.includes("주소") || text.includes("경찰"))) {
      return { text, enc, sn, size: buf.length };
    }
  }
  return null;
}

async function getAtchFileId(pageUrl) {
  const html = await (
    await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } })
  ).text();
  const m = html.match(/fileDownload\.do\?atchFileId=([^&"']+)/);
  return m?.[1] ?? null;
}

const stationsId = await getAtchFileId("https://www.data.go.kr/data/15124966/fileData.do");
const substationsId = await getAtchFileId("https://www.data.go.kr/data/15077036/fileData.do");
console.log("ids", stationsId, substationsId);

const s = await downloadBestCsv(stationsId);
const sub = await downloadBestCsv(substationsId);

if (s) {
  fs.writeFileSync(path.join(ROOT, "geo-data", "police-stations.csv"), s.text);
  console.log("stations", s.enc, "sn", s.sn, "size", s.size);
  console.log(s.text.split("\n").slice(0, 3).join("\n"));
}
if (sub) {
  fs.writeFileSync(path.join(ROOT, "geo-data", "police-substations.csv"), sub.text);
  console.log("substations", sub.enc, "sn", sub.sn, "size", sub.size);
  console.log(sub.text.split("\n").slice(0, 3).join("\n"));
}
