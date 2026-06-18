# IP2Location DB 자동 설치

## 왜 자동 로그인은 안 되나요?

IP2Location 계정은 **본인 Google/이메일 로그인**이 필요합니다. 보안상 제가 대신 로그인할 수는 없습니다.  
대신 **다운로드 토큰** 또는 **이미 받은 ZIP**을 자동 처리합니다.

## 방법 A — 토큰으로 자동 다운로드 (권장)

1. [lite.ip2location.com](https://lite.ip2location.com/database-download) 로그인
2. **Download Token** 복사
3. `.env.local`에 추가:
   ```env
   IP2LOCATION_DOWNLOAD_TOKEN=여기에_토큰
   ```
4. 실행:
   ```bash
   npm run geo:update-db
   ```

스크립트가 **DB5 LITE BIN**(위도·경도 포함)을 받아 `geo-data/`에 설치하고 테스트 IP로 조회합니다.

## 방법 B — 수동 다운로드 후 자동 설치

스크린샷처럼 사이트에서 받은 ZIP을 `Downloads`에 두고:

```bash
npm run geo:update-db
```

처리 대상 (IP 조회용):

- `IP2LOCATION-LITE-DB5.BIN.ZIP` ✅ (최소 — 좌표 있음)
- `IP2LOCATION-LITE-DB9.BIN.ZIP` / DB11 ✅ (더 많은 필드)
- IPv6 탭의 `*IPV6*` BIN ✅

**제외** (이름 번역·국기 등 — IP 조회와 무관):

- `*MULTILINGUAL*`, `*FLAGS*`, `*COUNTRY-INFORMATION*` …

## DB 종류 (스크린샷 기준)

| 코드 | 내용 | IP→좌표 |
|------|------|---------|
| DB1 | 국가만 | ❌ |
| DB3 | 국가·지역·도시 | ❌ |
| **DB5** | + 위도·경도 | ✅ **이것부터** |
| DB9 | + 우편번호 | ✅ |
| DB11 | + ISP 등 | ✅ |

형식은 **`.BIN.ZIP`** 만 사용합니다 (CSV/CIDR/MMDB는 현재 미지원).

## 확인

설치 후 `114.206.216.6` 등으로 API 테스트 — `geoSources`에 `ip2location`이 보이면 성공.
