import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [],
  },
  outputFileTracingExcludes: {
    "*": ["./geo-data/**/*"],
  },
  outputFileTracingIncludes: {
    "/api/geolocation": ["./geo-data/**/*.BIN", "./geo-data/**/*.bin"],
    "/api/geolocation/route": ["./geo-data/**/*.BIN", "./geo-data/**/*.bin"],
    "/api/ip": ["./geo-data/**/*.BIN", "./geo-data/**/*.bin"],
    "/api/nearest-police-station": ["./geo-data/police/stations.json"],
    "/api/nearest-police-station/route": ["./geo-data/police/stations.json"],
  },
};

export default nextConfig;
