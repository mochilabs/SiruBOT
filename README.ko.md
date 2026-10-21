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

Discord.js와 Lavalink를 사용하는 음악 봇입니다. 저장소에는 Next.js 대시보드, 데이터 API, 샤드 매니저, 스토리지, 알림 서비스(notifier)도 Yarn workspaces 모노레포로 함께 구성돼 있습니다.

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

- **음악 재생**: Lavalink 서버를 통한 오디오 스트리밍
- **웹 대시보드**: 음악 제어, 서버 설정, 샤드 상태 모니터링
- **데이터 API 게이트웨이**: 외부 API(날씨·가사·운세·택배·유튜브 챕터) 캐싱 및 예약된 LLM 작업
- **프로필 카드**: 별자리 배경, 배너, 아바타, 음악 통계를 담은 유저 프로필 이미지 카드
- **커스텀 플레이리스트**: 나만의 재생 목록을 생성하고 관리 및 불러오기 기능 지원
- **스마트 검색 자동 완성**: 디스코드 내에서 트랙 검색 시 자동 완성(Auto-complete) 제공
- **재생 큐 관리**: 재생 목록 셔플, 루프, 스킵, 특정 곡으로 이동 등의 조작 지원

---

## 🚀 시작하기

### 사전 준비 사항

- **Node.js**: v22 이상
- **Yarn**: v4.12.0 (Corepack으로 관리)
- **Database**: PostgreSQL (Prisma ORM 사용)
- 디스코드 봇 토큰 및 Lavalink 서버

### 환경 변수 설정 (`.env`)

각 앱 디렉토리의 `.env.example`을 복사해 `.env`를 만드세요. 아래는 로컬 실행에 필요한 주요 항목입니다. 비밀 값은 저장소에 커밋하지 마세요.

#### 1. 디스코드 봇 (`apps/bot/.env`)
```env
DISCORD_TOKEN=your_discord_bot_token_here
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot
REDIS_URL=redis://localhost:6379
LAVALINK_HOSTS=main_localhost_2333_youshallnotpass
# 선택: data-api 기능을 봇에서 사용
DATA_API_URL=http://localhost:3002
DATA_API_AUTH_KEY=replace_with_data_api_key
# 프로덕션 샤드 매니저 연결에 필요합니다. 단독 로컬 개발에서는 생략할 수 있습니다.
# SHARD_MANAGER_URL=ws://localhost:3001/ws
# AUTH_KEY=replace_with_a_shared_secret
```

#### 2. 웹 대시보드 (`apps/dashboard/.env`)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
AUTH_SECRET=generate_a_random_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
# 아래 값은 각 서비스의 주소와 키에 맞춰 설정하세요.
SHARD_MANAGER_URL=http://localhost:3001
SHARD_MANAGER_AUTH_KEY=replace_with_shard_manager_key
DATA_API_URL=http://localhost:3002
DATA_API_AUTH_KEY=replace_with_data_api_key
```

#### 3. 데이터 API (`apps/data-api/.env`)
```env
# 필수: 두 인증 키가 모두 없으면 data-api가 시작되지 않습니다.
DATA_API_AUTH_KEY=replace_with_data_api_key
# 또는 AUTH_KEY를 사용할 수 있습니다. 봇과 대시보드에도 같은 키를 설정하세요.
# AUTH_KEY=replace_with_data_api_key
# 선택: 공유 캐시와 요청 허브 (미설정 시 메모리로 폴백)
REDIS_URL=redis://localhost:6379
# 선택: 운세 번역 및 기억 정리 작업용 번역 프로바이더
OPENAI_COMPATIBLE_API_URL=http://127.0.0.1:8080/v1
OPENAI_API_KEY=your_api_key_here
TRANSLATION_MODEL=your_model_name
# 선택: 기억 정리는 DATABASE_URL과 번역 프로바이더가 모두 있어야 실행됩니다.
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
```

봇이 게이트웨이 기능을 쓰려면 `apps/bot/.env`의 `DATA_API_URL` 설정이 필요합니다(미설정 시 해당 기능 호출이 오류로 실패합니다). 대시보드의 기본 주소는 `http://localhost:3002`입니다. data-api, 봇, 대시보드에 `DATA_API_AUTH_KEY` 또는 `AUTH_KEY`를 같은 값으로 설정하세요. 요청의 `Authorization` 헤더에는 `Bearer` 접두사 없이 키 원문을 전달합니다. 인증 없이 접근할 수 있는 경로는 `/api/health`뿐입니다.

---

### 데이터 API 게이트웨이

게이트웨이는 기본 포트 `3002`에서 실행됩니다. 외부 프로바이더 호출은 게이트웨이가 전담하며, 봇과 대시보드는 게이트웨이를 통해서만 접근합니다.

| 엔드포인트 | 메서드 | 설명 | 캐시 TTL |
|---|---|---|---|
| `/v1/ohaasa` | GET | 오늘의 운세 (오하아사/TV아사히), LLM 한국어 번역 | 7일 |
| `/v1/lyrics?q=` | GET | 가사 검색 (lrclib.net) | 30일 |
| `/v1/weather?location=&scope=` | GET | 지오코딩 + 예보 + 대기질 (Open-Meteo) | 15분 |
| `/v1/chapters?videoId=&durationMs=` | GET | 장문 유튜브 영상의 챕터 마커 | 12시간 |
| `/v1/delivery/track?carrier=&number=` | GET | 택배 조회 (tracker.delivery), 별칭 해석은 서버가 처리 | 5분 |
| `/v1/playback/events` | POST | 봇 샤드의 재생 이벤트 수집 (시작/종료/끊김/오류/중단) | 해당 없음 |
| `/v1/playback/recent?limit=` | GET | 최근 재생 이벤트 및 오류 조회 | 해당 없음 |
| `/v1/image/profile` | POST | 프로필 카드 PNG 렌더링 (별자리 배경·배너·아바타·통계) | 해당 없음 |
| `/v1/ohaasa/refresh` | POST | 오늘의 운세 즉시 갱신 | 해당 없음 |
| `/v1/status` | GET | 운영 지표 (캐시 적중률, upstream 호출/오류, 서킷 브레이커) | 해당 없음 |
| `/dashboard` | GET | 내장 모니터링 대시보드 | 해당 없음 |

백그라운드 작업 (단일 인스턴스, 지터 포함 스케줄):
- **운세 번역**: 매일 KST 06:50에 실행하며 Redis 캐시를 미리 채웁니다.
- **기억 정리 (nightly pass)**: 매일 자정에 유저별 장기 기억을 LLM으로 정리합니다. `DATABASE_URL`과 번역 프로바이더가 모두 설정돼야 실행됩니다.

봇과 대시보드는 `DATA_API_URL`로 게이트웨이(기본 포트 `3002`)에 연결하며, 외부 프로바이더 호출은 게이트웨이가 전담합니다.

```bash
# 개발 실행
yarn generate
yarn workspace @sirubot/data-api build
yarn workspace @sirubot/data-api start
```

---

## 🛠️ 개발 및 빌드 스크립트

루트 디렉토리에서 아래 명령어로 모노레포 전체를 통합 제어할 수 있습니다.

```bash
# 의존성 패키지 설치
yarn install

# Prisma 클라이언트 코드 생성
yarn generate

# 설정된 앱 개발 서버 실행
yarn dev

# 데이터베이스 마이그레이션 적용
yarn workspace @sirubot/prisma migrate:dev

# 린트, 테스트, 전체 빌드
yarn lint
yarn test
yarn build
```

로컬 개발은 각 앱의 `.env`를 설정한 뒤 `yarn dev`로 시작합니다. 타입 검사나 빌드 전에 `yarn generate`를 실행해 Prisma 클라이언트를 생성하세요.

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

루트 Dockerfile은 봇, 대시보드, 샤드 매니저, 데이터 API, 스토리지, 알림 서비스 이미지를 각각 빌드합니다. `--target`으로 서비스를 선택하고 실행 시 해당 환경 변수를 전달하세요. 저장소의 Compose 파일은 일부 예시이며, 앱과 Redis/PostgreSQL 서비스 설정은 주석 처리돼 있습니다.

```bash
# 봇 이미지 빌드
docker build --target bot -t sirubot-bot:latest .

# 다른 target: dashboard, shardmanager, data-api, storage, notifier
```

컨테이너 실행 전에 PostgreSQL, Redis, Lavalink와 각 서비스 인증 정보를 준비하세요. 봇 이미지는 시작할 때 Prisma 마이그레이션을 실행합니다.

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
