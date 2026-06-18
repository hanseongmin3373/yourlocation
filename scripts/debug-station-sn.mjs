#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const id = "FILE_000000003634826";

for (let sn = 1; sn <= 5; sn++) {
  const dl = `https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=${id}&fileDetailSn=${sn}&insertDataPrcus=N`;
  const buf = Buffer.from(
    await (await fetch(dl, { headers: { "User-Agent": "Mozilla/5.0" } })).arrayBuffer(),
  );
  for (const enc of ["utf-8", "euc-kr", "cp949"]) {
    try {
      const text = new TextDecoder(enc).decode(buf);
      console.log(`sn=${sn} enc=${enc} size=${buf.length} head=${text.slice(0, 80).replace(/\n/g, "\\n")}`);
    } catch {}
  }
  fs.writeFileSync(path.join(ROOT, "geo-data", `station-sn${sn}.bin`), buf);
}
