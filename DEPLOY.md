# Vercel 배포 가이드 — yourlocation.co.kr

## 사전 준비

- [Node.js LTS](https://nodejs.org) 설치
- [GitHub](https://github.com) 계정
- [Vercel](https://vercel.com) 계정 (GitHub 연동)
- [Kakao Developers](https://developers.kakao.com) 앱 + JavaScript 키

---

## 1단계: 카카오맵 API 키 발급

1. [Kakao Developers](https://developers.kakao.com) 로그인
2. **내 애플리케이션** → **애플리케이션 추가하기**
   - 앱 이름: `YourLocation` (임의)
   - 사업자명: 본인 이름 또는 회사명
3. 생성된 앱 → **앱 키** → **JavaScript 키** 복사
4. **플랫폼** → **Web** 추가 → 사이트 도메인 등록:
   ```
   http://localhost:3000
   https://yourlocation.co.kr
   https://*.vercel.app
   ```
5. **제품 설정** → **카카오맵** → **활성화 설정** ON

---

## 2단계: 로컬 환경 변수

프로젝트 루트에서:

```powershell
copy .env.example .env.local
```

`.env.local` 파일을 열고 키 입력:

```
NEXT_PUBLIC_KAKAO_MAP_KEY=JavaScript_키
KAKAO_REST_API_KEY=REST_API_키
```

로컬 실행 확인:

```powershell
npm install
npm run dev
```

브라우저에서 http://localhost:3000 접속 → IP 조회 및 지도 표시 확인

---

## 3단계: GitHub 저장소 생성 및 푸시

```powershell
cd C:\Users\admin\Projects\yourlocation
git init
git add .
git commit -m "Initial commit: IP location lookup site"
```

GitHub에서 새 저장소 `yourlocation` 생성 후:

```powershell
git remote add origin https://github.com/YOUR_USERNAME/yourlocation.git
git branch -M main
git push -u origin main
```

---

## 4단계: Vercel 배포

1. [vercel.com/new](https://vercel.com/new) 접속
2. GitHub 저장소 `yourlocation` Import
3. **Environment Variables** 추가:
   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_KAKAO_MAP_KEY` | 카카오 **JavaScript** 키 |
   | `KAKAO_REST_API_KEY` | 카카오 **REST API** 키 |
4. **Deploy** 클릭
5. 배포 완료 후 `https://yourlocation-xxx.vercel.app` 형태 URL 확인

---

## 5단계: 커스텀 도메인 연결 (yourlocation.co.kr · 가비아)

> 도메인을 **가비아**에서 구매한 경우 아래 순서를 따르세요.  
> 네임서버는 **가비아 네임서버(`ns.gabia.co.kr`)** 를 그대로 두고 DNS 레코드만 추가하면 됩니다.

### ① Vercel에 도메인 추가 (먼저)

1. Vercel 프로젝트 → **Settings** → **Domains**
2. `yourlocation.co.kr` 입력 → **Add**
3. `www.yourlocation.co.kr`도 **Add** (Recommended 옵션 선택 시 www → 루트 리다이렉트 자동 설정)
4. **Invalid Configuration** 이 떠도 정상입니다. Vercel이 요구하는 DNS 레코드 값을 확인합니다.

Vercel 화면에 표시되는 **Type / Name / Value** 를 그대로 복사해 두세요.  
(프로젝트마다 CNAME 값이 조금 다를 수 있습니다.)

일반적인 예시:

| 타입 | 호스트(Name) | 값(Value) |
|------|-------------|-----------|
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

> Vercel이 다른 IP나 CNAME을 안내하면 **Vercel 화면 값을 우선** 사용하세요.

### ② 가비아 DNS 레코드 설정

1. [가비아 My가비아](https://www.gabia.com) 로그인
2. **My가비아** → **서비스 관리** → **도메인**
3. `yourlocation.co.kr` 선택 → **DNS 관리** (또는 **DNS 설정**)
4. **레코드 추가** (기존 `@`, `www` A/CNAME 레코드가 있으면 **수정** 또는 **삭제 후 재등록**)

가비아 입력 예시:

| 타입 | 호스트 | 값 | TTL |
|------|--------|-----|-----|
| A | `@` (또는 비움) | `76.76.21.21` | 600~3600 |
| CNAME | `www` | `cname.vercel-dns.com` | 600~3600 |

5. **저장** 클릭

### ③ 연결 확인

- DNS 전파: 보통 **5분~1시간** (최대 48시간)
- Vercel Domains 화면 상태가 **Valid Configuration** 으로 바뀌면 완료
- Vercel이 **SSL(HTTPS) 인증서** 를 자동 발급합니다
- https://yourlocation.co.kr 접속 후 자물쇠 아이콘 확인

### ④ 카카오 Web 도메인 등록 (지도용)

[Kakao Developers](https://developers.kakao.com) → 앱 → **플랫폼** → **Web** 에 추가:

```
https://yourlocation.co.kr
https://www.yourlocation.co.kr
```

### 가비아 DNS 주의사항

- `@` 호스트에 **CNAME은 사용 불가** → 루트 도메인은 **A 레코드** 사용
- `www` 는 **CNAME** 으로 Vercel에 연결
- 가비아 기본 **파킹/리다이렉트** 레코드가 있으면 Vercel 레코드와 **충돌** → 삭제 후 재설정
- **네임서버를 Vercel로 변경하지 않아도** 됩니다 (가비아 DNS만 수정)

### 도메인 등록업체(DNS) 측 — 참고 (가비아 외)

**방법 A — A 레코드 (권장)**

| Type | Name | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |

**방법 B — CNAME**

| Type | Name | Value |
|------|------|-------|
| CNAME | `@` 또는 `www` | Vercel이 제공하는 cname.vercel-dns.com |

> 등록업체마다 `@` apex CNAME 지원 여부가 다릅니다. Vercel Domains 화면의 안내를 따르세요.

DNS 전파 후 Vercel에서 **Valid Configuration** 표시되면 완료 (최대 24~48시간, 보통 수 분~1시간).

---

## 6단계: 카카오 도메인 최종 등록

배포 URL이 확정되면 Kakao Developers **Web 플랫폼**에 실제 Vercel URL도 등록:

```
https://yourlocation.co.kr
https://www.yourlocation.co.kr
```

---

## 체크리스트

- [ ] Node.js 설치
- [ ] 카카오 JavaScript 키 발급
- [ ] `.env.local` 설정 및 로컬 테스트
- [ ] GitHub 푸시
- [ ] Vercel 환경 변수 설정 후 Deploy
- [ ] yourlocation.co.kr DNS → Vercel 연결
- [ ] 카카오 Web 도메인에 운영 URL 등록
- [ ] 운영 사이트에서 IP 조회 + 지도 동작 확인

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| 지도가 안 보임 | `NEXT_PUBLIC_KAKAO_MAP_KEY` 확인, 카카오 Web 도메인 등록 확인 |
| IP 조회 실패 | ip-api.com 무료 한도(분당 45회) — 잠시 후 재시도 |
| Vercel 빌드 실패 | `npm run build` 로컬에서 먼저 확인 |
| DNS 미연결 | 등록업체 DNS 설정 및 전파 대기 |
