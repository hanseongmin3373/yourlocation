# 경찰관서 DB

## 데이터 출처 (우선순위)

1. **경찰청 직제 시행규칙 [별표 2] PDF** — 경찰서 명칭·위치·관할구역  
   - [police.go.kr bbsCode=1038](https://www.police.go.kr/user/bbs/BD_selectBbsList.do?q_bbsCode=1038&q_tab=1) 와 동일  
   - 프로젝트: `geo-data/police/police-stations-official.pdf`

2. **공공데이터 CSV** — 전국 지구대·파출소 (최근접 보조)

## 설치

PDF를 `geo-data/police/police-stations-official.pdf`에 두고:

```bash
npm run police:update-db
```

또는 Downloads PDF 경로 지정:

```bash
node scripts/setup-police-db.mjs "C:/Users/admin/Downloads/[별표 2] ....pdf"
```

## 매칭 방식

1. **관할구역** — IP/GPS 역지오코딩 동·읍·면이 [별표2] 관할 목록에 있으면 해당 **경찰서**
2. **최근접** — 관할 매칭 실패 시 Haversine 거리 (지구대·파출소 포함)

## API

`GET /api/nearest-police-station?lat=37.5&lng=127.0&dong=논현동&sigungu=강남구`
