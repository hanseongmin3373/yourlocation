import {
  isProviderErrorValue,
  sanitizeDisplayAddress,
  sanitizeGeoText,
} from "../src/lib/geo-field-sanitize.ts";
import { isDongLevelName, parseDbIpCityHints } from "../src/lib/ipinfo-kr.ts";

const err =
  "This method is not applicable for current IP2Location binary data file. Please upgrade your subscription package to install new data file.";

const cases = [
  [isProviderErrorValue(err), true],
  [sanitizeGeoText(err), ""],
  [
    sanitizeDisplayAddress(`서울 Banpo-dong ${err}`),
    "서울 Banpo-dong",
  ],
  [isDongLevelName("Banpo-dong"), true],
  [parseDbIpCityHints("Banpo-dong").sigungu, ""],
  [parseDbIpCityHints("Banpo-dong").dong, "반포동"],
  [parseDbIpCityHints("Uijeongbu-si (Uijeongbu-dong)").sigungu, "의정부시"],
];

let failed = 0;
for (const [actual, expected] of cases) {
  if (actual !== expected) {
    console.error("FAIL", { actual, expected });
    failed++;
  }
}
if (failed) process.exit(1);
console.log("geo-field-sanitize: ok");
