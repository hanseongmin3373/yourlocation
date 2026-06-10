# YourLocation - IP 위치 조회 서비스

[mylocation.co.kr](https://mylocation.co.kr)과 동일한 기능의 IP 위치 조회 웹사이트입니다.

**도메인:** [yourlocation.co.kr](https://yourlocation.co.kr)

## 기능

- 접속 IP 자동 확인
- IP 주소 검색으로 위치 조회
- 위도/경도 표시
- 주소 표시
- 카카오맵 연동
- 브라우저 GPS 현재 위치 확인
- 모바일 최적화 반응형 UI
- SEO 최적화 (메타태그, sitemap, robots.txt, JSON-LD)

## 기술 스택

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS 4
- Pretendard 폰트
- ip-api.com (IP Geolocation)
- Kakao Maps API

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 복사하여 `.env.local` 파일을 만듭니다.

```bash
cp .env.example .env.local
```

[Kakao Developers](https://developers.kakao.com)에서 앱을 생성하고 **JavaScript 키**를 발급받아 설정합니다.

```
NEXT_PUBLIC_KAKAO_MAP_KEY=발급받은_JavaScript_키
```

카카오 개발자 콘솔에서 **플랫폼 > Web** 도메인에 아래 주소를 등록하세요.

- `http://localhost:3000` (개발)
- `https://yourlocation.co.kr` (운영)
- `https://*.vercel.app` (Vercel 프리뷰, 선택)

### 3. 개발 서버 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인합니다.

## Vercel 배포

1. GitHub에 프로젝트를 푸시합니다.
2. [Vercel](https://vercel.com)에서 프로젝트를 Import합니다.
3. Environment Variables에 `NEXT_PUBLIC_KAKAO_MAP_KEY`를 추가합니다.
4. Deploy 후 Vercel 도메인을 카카오 개발자 콘솔 Web 플랫폼에 등록합니다.
5. yourlocation.co.kr 도메인을 Vercel 프로젝트 Settings > Domains에 연결합니다.

## 프로젝트 구조

```
src/
├── app/
│   ├── api/
│   │   ├── ip/           # 접속 IP 조회
│   │   └── geolocation/  # IP 위치 조회
│   ├── layout.tsx        # SEO 메타데이터
│   ├── page.tsx          # 메인 페이지
│   └── sitemap.ts
├── components/
│   ├── KakaoMap.tsx
│   ├── LocationInfo.tsx
│   ├── IpSearchForm.tsx
│   └── ...
└── lib/
    ├── geo.ts
    └── types.ts
```

## 라이선스

MIT
