/**
 * 특정 IP 등록 데이터를 사용자 확인 주소로 수정
 * 사용: node scripts/fix-verified-ip.mjs 1.227.161.184 "서울 강남구 논현로 526"
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function geocode(query) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) throw new Error("KAKAO_REST_API_KEY required");

  const res = await fetch(
    `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(query)}&size=5`,
    { headers: { Authorization: `KakaoAK ${key}` } },
  );
  if (!res.ok) throw new Error(`Kakao geocode failed: ${res.status}`);
  const json = await res.json();
  const doc = json.documents?.[0];
  if (!doc) throw new Error(`No result for: ${query}`);

  const road = doc.road_address;
  const legal = doc.address;
  const lat = Number(doc.y);
  const lon = Number(doc.x);
  const sido = road?.region_1depth_name || legal?.region_1depth_name || "";
  const sigungu = road?.region_2depth_name || legal?.region_2depth_name || "";
  const dong = road?.region_3depth_name || legal?.region_3depth_name || "";
  const address = road?.address_name || legal?.address_name || query;

  return { lat, lon, address, sido, sigungu, dong };
}

async function main() {
  const ip = process.argv[2] || "1.227.161.184";
  const query = process.argv[3] || "서울 강남구 논현로 526";

  const geo = await geocode(query);
  const parts = ip.split(".");
  const prefix24 =
    parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}` : null;

  const result = await prisma.ipLocationEntry.upsert({
    where: { ip },
    create: {
      ip,
      ipPrefix24: prefix24 || "1.227.161",
      lat: geo.lat,
      lon: geo.lon,
      accuracyM: 10,
      address: geo.address,
      appliedAddress: geo.address,
      roadAddress: geo.address,
      dong: geo.dong,
      sido: geo.sido,
      sigungu: geo.sigungu,
      source: "admin-verified",
      userVerified: true,
      verifiedAt: new Date(),
      registerCount: 1,
    },
    update: {
      lat: geo.lat,
      lon: geo.lon,
      accuracyM: 10,
      address: geo.address,
      appliedAddress: geo.address,
      roadAddress: geo.address,
      dong: geo.dong,
      sido: geo.sido,
      sigungu: geo.sigungu,
      source: "admin-verified",
      userVerified: true,
      verifiedAt: new Date(),
    },
  });

  console.log("Updated:", result.ip, result.address, result.lat, result.lon);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
