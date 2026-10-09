<h1 align="center">
SiruBOT

[![Latest Version](https://img.shields.io/github/v/release/mochiLabs/SiruBOT?label=latest%20version)](https://github.com/mochiLabs/SiruBOT/releases)
![Node version](https://img.shields.io/badge/node-%3E%3D22.0-brightgreen)
![GitHub](https://img.shields.io/github/license/mochiLabs/SiruBOT)
[![Run lint](https://github.com/mochilabs/SiruBOT/actions/workflows/lint.yml/badge.svg)](https://github.com/mochilabs/SiruBOT/actions/workflows/lint.yml)
[![Publish Docker Image](https://github.com/mochilabs/SiruBOT/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/mochilabs/SiruBOT/actions/workflows/docker-publish.yml)

</h1>

<p align="center">
  <a href="README.md">English</a> | <b>한국어</b>
</p>

Discord.js와 Lavalink를 기반으로 구축된 최신 디스코드 음악 봇 시루봇(SiruBOT) 입니다. Turbo와 Yarn workspaces를 적용한 모노레포(Monorepo) 아키텍처로 설계되었습니다.

---

## 🏗️ 프로젝트 구조

```
sirubot/
├── apps/
│   ├── bot/           # 디스코드 봇 애플리케이션
│   ├── dashboard/     # Next.js 웹 대시보드
│   ├── data-api/      # 외부 데이터 게이트웨이 (캐시 + LLM 배치 작업)
│   └── shardmanager/  # 샤드 관리 서버 (Shard Management)
└── packages/
    ├── prisma/        # 데이터베이스 스키마 및 클라이언트
    ├── shardclient/   # 샤드 클라이언트 라이브러리
    └── utils/         # 공통 유틸리티 기능 패키지
```

---

## 🎵 핵심 기능

- **고품질 음악 재생**: Lavalink 서버를 통한 오디오 스트리밍
- **대시보드 컨트롤러**: 웹 브라우저를 통해 실시간으로 봇 상태 제어 및 샤드 모니터링 기능 제공
- **데이터 API 게이트웨이**: 외부 API 호출(날씨·가사·운세·택배·유튜브 챕터)을 한 곳에서 캐싱하고, 예약된 LLM 배치 작업을 실행 — 샤드마다 반복 요청하는 대신 인스턴스 1개가 공유
- **프로필 카드**: 유저 프로필을 이미지 카드로 렌더링 — 별자리 배경, 유저 배너, 프로필 사진, 음악 통계
- **커스텀 플레이리스트**: 나만의 재생 목록을 생성하고 관리 및 불러오기 기능 지원
- **스마트 검색 자동 완성**: 디스코드 내에서 트랙 검색 시 자동 완성(Auto-complete) 제공
- **재생 큐 관리**: 재생 목록 셔플, 루프, 스킵, 특정 곡으로 이동 등의 조작 지원

---

## 🚀 시작하기

### 사전 준비 사항

- **Node.js**: v22 이상
- **Yarn**: v4.6.0 이상 (Corepack 활성화 필요)
- **Database**: PostgreSQL (Prisma ORM 사용)
- 디스코드 봇 토큰 및 Lavalink 서버

### 환경 변수 설정 (`.env`)

각 애플리케이션 실행을 위해 루트 디렉토리 또는 각 패키지 내에 `.env` 설정을 완료해야 합니다.

#### 1. 디스코드 봇 (`apps/bot/.env`)
```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
LAVALINK_URL=localhost:2333
LAVALINK_PASSWORD=youshallnotpass
```

#### 2. 웹 대시보드 (`apps/dashboard/.env`)
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
```

#### 3. 데이터 API (`apps/data-api/.env`)
```env
# 공유 캐시 (미설정 시 메모리 캐시로 폴백)
REDIS_URL=redis://localhost:6379
# 인증 키 — 봇의 AUTH_KEY와 같아야 해요
AUTH_KEY=shared_secret_here
# 선택: 운세 번역 + 기억 정리 배치용 LLM
OPENAI_COMPATIBLE_API_URL=http://127.0.0.1:8080/v1
OPENAI_API_KEY=your_api_key_here
TRANSLATION_MODEL=your_model_name
# 선택: 있을 때만 매일 자정 기억 정리(nightly pass) 잡이 활성화돼요
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
# 선택: 봇이 이 게이트웨이를 쓰게 하려면 (apps/bot/.env에 설정)
# DATA_API_URL=http://localhost:3002
```

---

### 데이터 API 게이트웨이

봇 샤드가 외부 API를 직접 호출하지 않도록 한 곳에서 대신 처리해요. 모든 읽기 엔드포인트는 인증(`/api/health` 제외) 후 Redis 공유 캐시(라우트별 TTL), 동시 동일 요청 하나로 합치기(in-flight dedup), 프로바이더별 서킷 브레이커로 보호돼요.

| 엔드포인트 | 메서드 | 설명 | 캐시 TTL |
|---|---|---|---|
| `/v1/ohaasa` | GET | 오늘의 운세 (오하아사/TV아사히), LLM 한국어 번역 | 7일 |
| `/v1/lyrics?q=` | GET | 가사 검색 (lrclib.net) | 30일 |
| `/v1/weather?location=&scope=` | GET | 지오코딩 + 예보 + 대기질 (Open-Meteo) | 15분 |
| `/v1/chapters?videoId=&durationMs=` | GET | 장문 유튜브 영상의 챕터 마커 | 12시간 |
| `/v1/delivery/track?carrier=&number=` | GET | 택배 조회 (tracker.delivery), 별칭 해석은 서버가 처리 | 5분 |
| `/v1/playback/events` | POST | 봇 샤드의 재생 이벤트 수집 (시작/종료/끊김/오류/중단) | — |
| `/v1/playback/recent?limit=` | GET | 최근 재생 이벤트 및 오류 조회 | — |
| `/v1/image/profile` | POST | 프로필 카드 PNG 렌더링 (별자리 배경·배너·아바타·통계) | — |
| `/v1/ohaasa/refresh` | POST | 오늘의 운세 즉시 갱신 | — |
| `/v1/status` | GET | 운영 지표 (캐시 적중률, upstream 호출/오류, 서킷 브레이커) | — |
| `/dashboard` | GET | 내장 모니터링 대시보드 (서드파티 의존성 0) | — |

백그라운드 작업 (단일 인스턴스, 지터 포함 스케줄):
- **운세 번역** — 매일 KST 06:50, Redis 캐시를 미리 채워서 샤드 요청이 LLM을 치지 않아요.
- **기억 정리 (nightly pass)** — 매일 자정, 유저별 장기 기억(MEMORY.md)을 LLM으로 정리. `DATABASE_URL`과 번역 프로바이더가 모두 설정돼 있을 때만 활성화돼요.

봇에 `DATA_API_URL`을 설정하면 게이트웨이만 사용해요. 미설정이면 외부 API를 직접 호출하므로, 개발 환경에서는 게이트웨이 없이도 동작해요.

```bash
# 개발 실행
turbo dev --filter=@sirubot/data-api
```

---

## 🛠️ 개발 및 빌드 스크립트

루트 디렉토리에서 아래 명령어로 모노레포 전체를 통합 제어할 수 있습니다.

```bash
# 의존성 패키지 설치
yarn install

# 전체 개발 서버 구동 (Bot, Dashboard 동시 실행)
yarn dev

# Prisma 클라이언트 코드 생성
yarn generate

# 데이터베이스 마이그레이션 적용
yarn workspace @sirubot/prisma migrate:dev

# 전체 빌드 수행
yarn build

# 코드 린트 및 서식 정렬
yarn lint
```

### 개별 애플리케이션 및 패키지 실행 (Turbo 필터)

전체 실행 대신 특정 프로젝트만 빌드하거나 개발 모드로 실행하고 싶다면 Turbo 필터를 이용하세요:

```bash
# 봇 단독 개발 실행
turbo dev --filter=@sirubot/bot

# 대시보드 단독 개발 실행
turbo dev --filter=@sirubot/dashboard

# 공통 유틸리티 빌드
turbo build --filter=@sirubot/utils
```

---

## 🐳 Docker 배포 가이드

컨테이너 환경에서 전체 스택을 손쉽게 실행할 수 있도록 Docker 설정을 지원합니다.

```bash
# Docker 이미지 빌드
docker build -t sirubot:latest .

# 컨테이너 실행
docker run -d --name sirubot-container \
  -e DISCORD_TOKEN="your_token" \
  -e DATABASE_URL="your_db_url" \
  sirubot:latest
```

---

## 🤝 기여 방법

1. 저장소를 포크(Fork)합니다.
2. 새로운 기능 브랜치를 생성합니다 (`git checkout -b feature/amazing-feature`).
3. 변경 사항을 커밋합니다 (`git commit -m 'feat: add amazing feature'`).
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`).
5. 풀 리퀘스트(Pull Request)를 생성합니다.

---

## 📝 라이선스

본 프로젝트는 MIT 라이선스에 따라 라이선스가 부과됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하십시오.
