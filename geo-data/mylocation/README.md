# mylocation.co.kr IP DB 가져오기

mylocation은 **ASP.NET (Cafe24, 222.122.213.231)** 이며 공개 bulk API가 없습니다.  
약 **252만 건** GPS·IP 등록 데이터는 **호스팅 DB(MSSQL)** 에 있습니다.

## 1. Cafe24에서 DB보내기

1. Cafe24 호스팅 관리 → **DB 관리** (MSSQL)
2. mylocation 사이트 DB 선택
3. IP·좌표 테이블 export (CSV 또는 SQL)

테이블명은 사이트마다 다릅니다. 흔한 후보: `IPLocation`, `UserIP`, `tb_IP` 등.

**SQL 예시 (테이블명 확인 후 수정):**

```sql
SELECT
  IP AS ip,
  Latitude AS lat,
  Longitude AS lon,
  Accuracy AS accuracyM,
  Address AS address,
  Dong AS dong,
  Sido AS sido,
  Sigungu AS sigungu,
  ISP AS isp,
  RegDate AS created_at
FROM dbo.IPLocation
WHERE IP IS NOT NULL;
```

4. 결과를 `geo-data/mylocation/export.csv` 로 저장

## 2. yourlocation에 import

```bash
# CSV / JSON
node scripts/import-mylocation.mjs --file geo-data/mylocation/export.csv

# MSSQL 직접 (연결 문자열 필요)
# .env.local → MYLOCATION_MSSQL_URL=Server=...;Database=...;User Id=...;Password=...
npm install mssql
node scripts/import-mylocation.mjs --probe
node scripts/import-mylocation.mjs --mssql
```

## 3. import 후

- `IpLocationEntry`에 `source: mylocation-import` 로 저장
- IP 조회 시 `lookupCrowdIpExact()` 가 GeoIP보다 우선

## 4. 필요한 정보 (운영자에게 요청)

- Cafe24 **MSSQL 호스트·DB명·계정** 또는
- 위 SQL 결과 **CSV 파일** (252만 행, 수백 MB 가능)
