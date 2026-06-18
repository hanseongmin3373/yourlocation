#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const raw = JSON.parse(
  fs.readFileSync(path.join(ROOT, "geo-data/police/stations.json"), "utf8"),
);
const lat = 37.503446;
const lon = 127.035998;

let best = null;
let bestD = Infinity;
for (const s of raw.stations) {
  const d = haversineMeters(lat, lon, s.lat, s.lon);
  if (d < bestD) {
    bestD = d;
    best = s;
  }
}
console.log("nearest to 논현로526:", best?.name, best?.address, Math.round(bestD) + "m");
