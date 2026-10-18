# 채팅 메시지 → TTS 자동 읽기 기능 명세서

> **상태**: 구현 중 (PR-C1 ttsService+스키마 — PR-C2 리스너, PR-C3 대시보드 남음)
> **형태**: 기능 명세서 — 구현 계획(task 분해)은 이 명세 확정 후 별도 문서로 만든다.
> **Baseline**: 조사 `fix/member-greeting-tests` @ `8bbe4142` (2026-10-18). 구현은 `beta` 분기 feature 브랜치에서 시작.
> **사전 요구**: PR-B4(mixer announce 202 큐잉 계약 마이그레이션), siru_tts 공개 URL 옵션(아래 5장).

---

## 0. TL;DR

| 항목 | 내용 |
| --- | --- |
| 한 줄 요약 | 허용된 텍스트 채널에 메시지가 오면 시루가 그 내용을 TTS로 읽어 음성 채널에 들려준다 |
| 음악 재생 중 | **오버레이 모드** — mixer announce(ducking)로 음악 위에 얹는다 (PR-B4 큐잉 계약) |
| 음악 없이 TTS만 | **단독 모드** — 클립을 메인 플레이어 트랙으로 재생한다 (mixer announce는 메인 트랙이 없으면 들리지 않음, 4.2장) |
| TTS 엔진 | self-hosted **siru_tts** (`POST /v1/synthesize`) — 기존 Google Translate TTS URL 대체 |
| 오디오 전달 | siru_tts가 **공개 URL**(capability token, 무인증 GET)을 request body 옵션으로 반환 → 봇이 그 URL을 재생/announce `identifier`로 넘김 |
| 설정 | 길드 정책 `ttsMode: off \| channels \| all` + `ttsChannelIds` (AI 채팅 정책과 동일한 형태) + 대시보드 패널 |
| 기본값 | `off` (길드가 명시적으로 켜야 함) |

---

## 1. 배경 · 사용자 스토리

대시보드 홈의 `chat-tts-preview.tsx`가 이미 약속한 경험 그대로를 만든다:

> "음성 채널에 시루가 참여해 노래를 틀다가, 채팅이 오면 한 줄씩 읽어요"

- **US-1**: 디스코드 음성 채널에서 노래를 듣다가, 지정된 텍스트 채널에 대화가 오면 시루가 각 메시지를 한 줄씩 읽어준다. 음악은 줄어들었다(ducking) 메시지가 끝나면 복귀한다.
- **US-2**: 노래를 틀지 않은 상태(시루가 음성 채널에만 있음)에서도 채팅을 읽어준다. 이때 읽는 소리가 끊기지 않고 연속 메시지가 순서대로 재생된다.
- **US-3**: 관리자는 대시보드에서 "읽어주는 중"을 켜고, 어느 채널의 메시지를 읽을지 선택한다. 끄면 즉시 읽기를 멈춘다.

## 2. 범위 / 비범위

**범위**
1. 메시지 수신 → 전처리 → 합성 → 재생(오버레이/단독) 전 파이프라인과 모든 스로틀·실패 규칙.
2. siru_tts 연동: 합성 호출, 공개 URL 수신, quota 인지 스로틀, 재시도.
3. siru_tts 서버 쪽 `return_url`(공개 URL) 옵션 추가 — **siru_tts 저장소 변경 포함** (별도 PR, 5.2장).
4. 길드 설정 저장/조회(Prisma + guildService + 대시보드 API·UI).

**비범위 (v1에서 만들지 않음)**
- 컨트롤러/큐에 "예약된 안내 N" 표시 — PR-B4 결정대로 **미표시**.
- siru_tts WS(`announceStart/End` 등) 소비.
- 사용자별 음성 프로필(`user_id: discord:<id>`) 적용 — 2단계 후보(8장).
- 기존 `/music tts`, AI 도구 `music_tts`의 Google TTS → siru_tts 교체 — 별도 이관 PR(8장). 단, 이 두 호출부도 announce 202 계약은 PR-B4에서 함께 마이그레이션한다.
- 메시지 발화자 닉네임을 먼저 읽는 옵션("민수: 어쩌구"), 읽기 중단 스킵 커맨드 — 미결 질문(9장).
- 스레드/포럼 채널 특별 처리, TTS 음성·속도·감정의 길드별 커스터마이징.

## 3. 확정된 결정 사항

| 항목 | 결정 | 근거 |
| --- | --- | --- |
| 재생 정책 | 오버레이(mixer announce + duck 0.2) 우선, 음악 없으면 단독 모드 | 오버레이는 음악 위 말풍선 UX(mixer-preview.tsx). 단독은 사용자 요구("노래 안틀고 그냥 tts 만") |
| 단독 모드 재생 대상 | **메인 플레이어 트랙**으로 클립 재생 | mixer siphon은 메인 필터 체인에만 있고 체인은 트랙 시작 시에만 생성 → announce 단독으로는 무음 (4.2장) |
| 안내 큐잉 | PR-B4 계약(409 없음, `202 {id, position, queueLength}`, 순차 재생) | mixer plugin commit `93e86f8` |
| TTS 백엔드 | self-hosted siru_tts, `Authorization: Bearer` | integration.md; Lavalink는 인증 헤더를 붙일 수 없음 |
| 오디오 전달 | **siru_tts request body 옵션으로 공개 URL 반환** (사용자 확정) | 식별자 fetch에 Bearer 불가 |
| 채널 정책 | `ttsMode: 'off'\|'channels'\|'all'` + `ttsChannelIds: string[]` | AI 채팅 정책(`aiMode`/`aiChannelIds`)과 동일 패턴 |
| 기본값 | `off` | 스팸/프라이버시 기본 보호 |
| 병합 | 같은 사용자·같은 채널, **3초** 창 내 메시지는 한 발화로 병합 | 클립당 합성 요청 수 절감, "한 줄씩 읽기"와 정합 |
| 클립 최대 길이 | 병합 결과 **300자**에서 절단 | siru_tts 상한 4096이지만 채팅 읽기는 짧게 유지 |
| 발화자 표기 | 내용만 읽음 (닉네임 생략) | 목업과 동일. 옵션화는 미결 질문 |
| 실패 처리 | **조용히 스킵 + 로그**. 채널 공지 없음 | 메시지마다 에러 스팸 방지 |
| 설정 위치 | 대시보드 패널(관리자). 슬래시 토글은 후속 | 설정 필드가 채널 다중 선택이라 대시보드가 적합 |
| 봇 메시지 | 봇/웹훅 메시지는 읽지 않음 | 상식선 |
| 명령어 메시지 | 커스텀 명령어 접두사(`customCommandPrefix`) 또는 `/`로 시작하는 메시지는 읽지 않음 | 명령어를 음성으로 읽으면 소음 |
| 음성 채널 멤버 제한 | 없음 (채팅 채널에 쓸 수 있으면 누구나) | `commandChannel.ts`(고정 채널) 선례와 동일 |
| TTS 클립의 큐 처리 | 단독 모드 클립은 **일시적 트랙** — 재생 히스토리·반복·자동추천(`related`) 제외 | TTS가 추천 알고리즘·통계를 오염시키면 안 됨 |
| duckLevel | 0.2 고정 (기존 `TTS_DUCK_LEVEL`과 동일) | v1 단순화 |

## 4. 동작 명세

### 4.1 트리거 조건

아래를 **모두** 만족하는 `MessageCreate`만 처리한다:

1. 메시지가 길드 텍스트 채널에 있고, 작성자가 봇/웹훅이 아니다.
2. 길드 `ttsMode`가 `off`가 아니고(`all`, 또는 `channels`이면서 `ttsChannelIds`에 채널이 포함), 캐시된 정책을 통과한다 — `assertChatEnabled`와 동일한 검사 패턴.
3. 봇이 해당 길드 음성 채널에 **연결되어 있다** (플레이어 존재 + 보이스 연결). 아니면 무시 — 사용자에게 알리지 않음.
4. 내용이 전처리 후 비어 있지 않다 (첨부/스티커만 있는 메시지는 무시).
5. 명령어 형태가 아니다: `customCommandPrefix`(기본 `!`)로 시작하거나, `/`로 시작하는 메시지는 무시.
6. 사용자 쿨다운·길드 스로틀(4.4)을 통과한다.

노트: `ttsMode=channels`인데 `ttsChannelIds`가 비면 아무것도 읽지 않는다(의도된 동작).

### 4.2 재생 모드 결정

수신 시점의 메인 플레이어 상태로 모드가 갈린다. **모드 결정은 클립 재생 시작 시점마다 다시 한다.**

| 상태 | 모드 | 동작 |
| --- | --- | --- |
| 메인 트랙 재생 중(일시정지 포함) | **오버레이** | `mixerService.announce(player, publicUrl, 0.2)` — mixer가 시작 시점에 identifier를 resolve하므로 URL은 항상 신선한 캐시된 공개 URL을 넘긴다. 이미 재생 중인 안내가 있으면 mixer가 큐잉(PR-B4: `202 {position}`) |
| 메인 트랙 없음(대기/빈 큐) | **단독** | 클립 URL을 Lavalink로 resolve해 **메인 플레이어**에서 트랙으로 재생. 이미 단독 클립이 재생 중이면 클립은 봇의 내부 TTS 큐(4.3)에 쌓였다가 현재 클립이 끝나면 다음 클립이 재생됨 |

전환 규칙:
- 단독 모드로 재생 중 사용자가 곡을 요청하면 곡은 일반 큐에 들어가 현재 클립 종료 후 재생된다. **그 시점 이후의 채팅 클립은 오버레이 모드로 전환**된다(음악이 재생 중이므로).
- 오버레이 중 음악이 끝나 대기 상태가 되면 다음 클립부터 단독 모드.
- 모드 전환이 일어나는 순간 이미 만들어진 클립은 버리지 않는다 — 재생 시점에 모드를 다시 판정해 해당 모드로 보낸다.

**단독 모드 클립(일시적 트랙) 규칙:**
- 트랙 제목: `TTS: <원문 앞 20자>` (디버그용). 큐/현재 곡 UI에는 그대로 노출되되, 재생 히스토리(`GuildTrackHistory`)에는 기록하지 않는다.
- 클립 종료 후 큐가 비면 기존 idle 규칙(5분 빈 방 타이머, `VoiceStateUpdateListener`)이 그대로 적용된다.
- 클립 종료가 곡 종료로 처리되어 `related`(자동 추천)·반복 재생이 켜져 있어도 **다음 곡을 추천/반복하지 않는다.** (구현상 트랙 종료 핸들러에서 TTS 클립 마커로 분기)
- 사용자 스킵(`/music skip`, 투표 스킵)은 TTS 클립에도 동작한다. 오버레이 안내는 mixer `cancel`/queue delete 계약을 쓴다(PR-B4 범위).

### 4.3 내부 TTS 큐 (단독 모드 연속 대응)

단독 모드에서 클립이 이미 재생 중일 때 새로 온 클립은 봇 프로세스 메모리(길드 단위 FIFO)에 대기한다. 상한 **5개** — 초과 시 가장 오래된 대기 클립을 버린다(재생 중인 것은 보호). 이 큐는 길드당 1개이며 재시작 시 유실되어도 무방하다(대화 내용 유실 아님).

오버레이 모드의 순차 재생은 mixer announce 큐(PR-B4)가 담당하므로 봇은 별도 큐를 두지 않는다. 단독 큐에 남아 있던 클립이 음악 시작과 함께 오버레이로 넘어갈 때는 단독 큐에서 빼 announce로 순서대로 보낸다.

### 4.4 스팸 · 스로틀 · quota 보호

| 통제 | 값(초기) | 동작 |
| --- | --- | --- |
| 사용자 간격 | 같은 (길드, 사용자) 연속 합성 요청 최소 **3초** | 미달 메시지는 병합 창에 합치되, 창을 넘으면 버린다 (silently drop) |
| 병합 창 | 같은 (길드, 채널, 사용자) **3초** | 창 안의 메시지는 하나의 발화로 합성. 순서 유지 |
| 클립 길이 | 병합 결과 **300자** 초과 시 절단 | 초과분은 읽지 않음 |
| 길드 동시 요청 | 합성 API 동시 호출 **2**개 | 초과분은 대기열(내부)로 |
| 길드 분당 글자 | **1,000자/분** (버킷) | 초과 시 클립 버림 + 로그 |
| 오버레이 대기 | mixer announce 큐 **5개** 초과 시 신규 거절 | `queueLength` 기준. 거절도 조용히 |
| quota 감시 | `GET /v1/usage` 결과를 5분 캐시. 사용자 quota 90% 소진 시 | 합성 중단(메시지 무시), 5분마다 1회 재확인 후 자동 복구(resets_at 이후) |

쿨다운 저장은 `CommandChannelListener`의 per-(guild:user) Map + `pruneCooldowns` 패턴을 재사용한다. 값은 상수로 두고 튜닝 여지를 남긴다.

### 4.5 메시지 전처리

원문 → 읽을 텍스트 변환 규칙 (전부 결정 사항):

| 입력 | 처리 |
| --- | --- |
| 서브 텍스트 축약 | 줄바꿈·연속 공백 → 단일 공백 |
| 멘션 `<@id>`/`<@!id>` | 해당 멤버의 서버 닉네임(없으면 유저네임)으로 치환 |
| 역할 멘션 `<@&id>` | 역할 이름으로 치환 |
| `@everyone`/`@here` | `모두` |
| 커스텀 이모지 `<:name:id>` | `name`으로 치환 |
| 유니코드 이모지 | 유지 |
| URL | `링크` |
| 인라인 코드/코드 블록/인용 | 마커 제거 후 내용만 (블록 내용도 읽는다) |
| 스포일러 `||...||` | 마커 제거 후 내용 읽기 (스포일러 의도 무시 — 단순화, 미결 질문 아님) |
| 첨부 파일/스티커만 있는 메시지 | **읽지 않음** (무시) |
| `<#id>` 채널 맨션 | 채널 이름으로 치환 |
| 빈 결과 | 무시 |

전처리 결과가 0자면 트리거 자체가 되지 않는다(4.1-4).

### 4.6 실패 처리 (모든 공통)

- **조용히 스킵**이 기본. 채널에 에러 메시지를 보내지 않는다. 로그는 warn 1회(요약), 이후 동일 원인은 debug.
- siru_tts 5xx/타임아웃: 4.7 재시도 매트릭스 준수. 재시도 소진 시 클립 폐기.
- 공개 URL fetch 실패(Lavalink resolve 실패): 클립 폐기.
- 서비스 미설정(`SIRU_TTS_URL`/키 없음): 기능이 꺼진 것처럼 동작(모든 메시지 무시), 기동 시 warn 1회.
- `/readyz` warmup 중(503)은 정상 — 첫 합성 전 readyz 확인 후 진행.

### 4.7 합성 지연 예산 (의도적 일탈)

integration.md는 클라이언트 타임아웃이 서버 예산(120s)을 넘길 것을 권장한다. 그러나 채팅 읽기는 **수십 초 늦게 도착하는 음성은 무의미**하므로:

- 채팅 TTS 요청의 클라이언트 예산: **20초** (합성 목표: 대화 템포를 유지할 수 있는 3~5초 이내).
- 20초 초과 시 소요 예산 1회 백오프 재시도 없이 즉시 폐기(silently).
- (`/music tts` 같은 비동기 명령형 호출은 이후 이관 시 integration.md의 180s 권고를 따를 수 있다 — 비범위.)

## 5. siru_tts 연동 계약

### 5.1 봇 → siru_tts (기존 API, 신규 사용)

```
POST {SIRU_TTS_URL}/v1/synthesize
Authorization: Bearer {SIRU_TTS_API_KEY}
Content-Type: application/json

{
  "text": "<전처리·병합된 발화, 1..300자>",
  "voice": "edge:ko-KR-SunHiNeural",   // SIRU_TTS_DEFAULT_VOICE 고정 핀 (integration.md 체크리스트)
  "format": "wav",
  "return_url": true                    // ← 신규 (5.2)
}
```

성공 응답 (`200 application/json`, 바이트 대신):

```json
{
  "url": "https://tts.example.com/v1/shared/Ab3...token",
  "expires_in": 600,
  "format": "wav",
  "cache": "hit"
}
```

봇은 `url`을 오버레이 `identifier` 또는 단독 모드 트랙 URL로 쓴다. `GET /v1/usage?user_id=` 스냅샷으로 4.4 quota 감시를 한다.

- env: `SIRU_TTS_URL`, `SIRU_TTS_API_KEY`, `SIRU_TTS_DEFAULT_VOICE` (미설정 시 기능 off). 봇 `core/environment.ts`/`Env` 타입에 추가.
- 재시도: 429/503은 `Retry-After` 준수 백오프+지터(최대 1회), 502/500 1회 백오프, 400/401/403/404/422 즉시 폐기. 4.7 예산 내에서만.

### 5.2 siru_tts 서버 변경 (siru_tts 저장소 PR)

**목표**: `POST /v1/synthesize`가 바이트 스트리밍 대신 **무인증 공개 URL**을 JSON으로 반환할 수 있게 한다. Lavalink가 인증 헤더 없이 fetch할 수 있는 유일한 경로.

| 항목 | 명세 |
| --- | --- |
| 요청 | `SynthRequest`에 `return_url: bool = false` 추가 (`additionalProperties: false` 유지하므로 스키마·openapi.json 재생성 필수). `return_url: true`면 `format`은 재생 가능한 포맷(wav 기본) 제한 |
| 응답 | `200 application/json` `{ url, expires_in, format, cache: "hit"\|"miss", duration_ms }`. `return_url: false`면 현행과 동일(바이트 + 헤더) |
| 공개 GET | `GET /v1/shared/{token}` — **Auth 의존성 없음**(`healthz` 패턴). `Content-Type: audio/...`, `Cache-Control: private, max-age=...` |
| 토큰 | `secrets.token_urlsafe(32)` (추측 불가 capability URL). 키/시크릿을 URL에 넣지 않는 integration.md 규칙과 양립 — 토큰은 접근 토큰이 아니라 공개 자원의 비추측 주소 |
| 저장 | 합성 결과 바이트를 TTL 저장소에 보관. `app/core/cache.py`의 `LRU(maximum_bytes, ttl)` 재사용. 기본 TTL **600초**(`SIRU_SHARE_TTL`), `max_audio_bytes` 상한 내에서만 발행 |
| URL base | `SIRU_PUBLIC_BASE_URL` (Settings 항목) — Lavalink가 도달 가능한 외부 주소. 미설정 시 `return_url=true` 요청은 400 `{code: "public_base_unset"}` |
| 보존 | 기존 합성 캐시와 저장소를 공유해 중복 합성 없음. 캐시 HIT도 quota 과금 정책은 현행 유지 |
| 검증 | 신규 테스트(공개 GET 무인증 200, 만료 토큰 404, 미설정 base 400, return_url=false 회귀), ruff, `openapi.json` 재생성 커밋, openapi-spec-validator |

### 5.3 프라이버시

- 읽기 대상 메시지의 **내용(전처리 후 텍스트)이 self-hosted siru_tts로 전송**된다. 외부 TTS 프로바이저로의 전달은 siru_tts 엔진 선택에 따르며(Edge 등 엔진은 온라인 서비스일 수 있음), 대시보드 설정 패널에 한 줄 고지.
- 합성 바이트는 siru_tts TTL(기본 600초) 동안 보관되고, 공개 URL을 아는 사람은 그 시간 동안 오디오를 받을 수 있다(토큰 비추측). 길지 않은 TTL로 제한.
- 봇은 음성을 저장하지 않는다.

## 6. 설정 계약

### 6.1 스키마 (`packages/prisma/src/schema.prisma` — `model Guild`)

```prisma
  // 채팅 TTS: off(기본) | channels(특정 채널만) | all. 채팅 메시지를 음성으로 읽어요.
  ttsMode       String   @default("off")
  ttsChannelIds String[] @default([])
```

`aiMode`/`aiChannelIds`와 형태를 맞춘다. 마이그레이션은 기본값만으로 동작(add column with default)이어야 한다.

### 6.2 봇

- `GuildService.getTtsSettings(guildId)` → `{ mode: 'off'|'channels'|'all', channelIds: string[] }` (`getAiSettings` 패턴, 잘못된 값은 `off`로 폴백).
- 대시보드 저장 → data-api → `GUILD_SETTINGS_INVALIDATE_CHANNEL` 기존 무효화 채널이 그대로 GuildService 캐시를 비우므로 별도 채널 불필요.
- 리스너: `apps/bot/src/modules/audio/listeners/chatTts.ts` (MessageCreate). 참고 구현: `commandChannel.ts`(쿨다운·피드백), `aiChatService.ts`(정책 검사).
- 합성 클라이언트: `apps/bot/src/services/ttsService.ts` (신규) — synthesize/usage/재시도/공개 URL 관리. `core/botApplication.ts`에 `container.ttsService` 등록.

### 6.3 대시보드

| 파일 | 변경 |
| --- | --- |
| `types/settings.ts` | `GuildSettings`에 `ttsMode`, `ttsChannelIds` |
| `lib/schemas.ts` | `guildSettingsSchema`에 `ttsMode: z.enum(['off','channels','all'])`, `ttsChannelIds: z.array(z.string())` |
| `app/api/servers/[id]/settings/route.ts` | `toSettings` 매핑 |
| `components/servers/` (신규 `tts-settings.tsx` 또는 `ai-settings.tsx` 인접) | 토글("읽어주는 중") + `ChannelSelect`(`CHANNEL_TYPE_GROUP.chat`) + 프라이버시 한 줄 고지. `ai-settings.tsx`의 ChannelSelect 패턴 재사용 |

## 7. 검증 계획

구현 PR 단위로 기록하되, 명세 기준의 수용 조건은 아래와 같다.

**자동화**
- `chatTts`(또는 전처리기) 단위 테스트: 전처리 표(6.5의 각 행), 병합 창(3초 안/밖), 300자 절단, 모드 결정(재생 중→announce 인자, 무음→트랙 재생), 사용자 쿨다운·길드 버킷, quota 스로틀, 재시도 매트릭스(429/503 `Retry-After` 사용), 실패 시 무응답(채널에 메시지 없음) 검증. 타이머는 `trackHandler.test.ts`의 fake timer 패턴.
- `ttsService` 테스트: `return_url` 응답 파싱, 공개 URL 만료 교체, 미설정 env 시 off.
- PR-B4 계약 테스트(선행): 202 파싱, 409 경로 제거, `docs/3rdparty.md` 갱신.
- siru_tts 쪽: 5.2의 신규 테스트 + 기존 회귀.
- `yarn lint` / `yarn typecheck` / `yarn test` 전 통과.

**수동 체크리스트 (봇 + 실제 음성)**
1. 노래 재생 중 채팅 → 음악이 줄고 읽은 뒤 복귀 (오버레이).
2. **노래 없이** 시루가 음성 채널에만 있는 상태에서 채팅 → TTS만 재생 (단독 모드, 사용자 핵심 요구).
3. 채팅 연타 → 3초 병합으로 한 발화, 클립 5개 초과 시 오래된 것 드랍.
4. 오버레이 연타 → mixer가 순차 재생, `202` position 동작 (PR-B4).
5. 단독 모드 중 곡 요청 → 현재 클립 종료 후 곡 재생, 이후 채팅은 오버레이 전환.
6. TTS 서비스 중지 → 채팅에 아무 반응 없음(스팸 없음), 재개 후 자동 복구.
7. 설정 `off`/`channels` 전환이 캐시 무효화로 빠르게 반영.
8. quota 고갈 시뮬레이션(`GET /v1/usage` 모의) → 읽기 중단·복구.

## 8. 단계별 납품 (PR 분해)

| PR | 내용 | 저장소 | 의존 |
| --- | --- | --- | --- |
| PR-A | `return_url` + `GET /v1/shared/{token}` + `SIRU_PUBLIC_BASE_URL` | siru_tts | — |
| PR-B4 | mixer announce 202 큐잉 계약 마이그레이션 (기존 보고서 정의) | SiruBOT | — (병렬 가능) |
| PR-C1 | `ttsService` + env + Guild 스키마(`ttsMode`/`ttsChannelIds`) + guildService + 정책 폴백 | SiruBOT | PR-A |
| PR-C2 | `chatTts` 리스너: 트리거·전처리·병합·스로틀·오버레이/단독 모드 | SiruBOT | PR-C1, PR-B4 |
| PR-C3 | 대시보드 설정 패널 + 스키마/API | SiruBOT | PR-C1 |
| PR-D (후보) | `/music tts`·`music_tts` AI 도구의 Google TTS → siru_tts 이관 | SiruBOT | PR-A |
| 2단계 후보 | 사용자별 음성 프로필(`user_id: discord:<id>`), 닉네임 선독 옵션, 스킵 커맨드, 길드별 voice 설정 | — | PR-C2 |

## 9. 미결 질문 (2026-10-18 확정)

1. **닉네임 선독**: **내용만 읽기로 확정** (목업 준수). "닉네임: 내용" 토글은 2단계 후보로 남긴다.
2. **스킵 UX**: **버리기만으로 확정** — 오버레이 대기 5개 초과 시 신규/오래된 클립 조용히 폐기. DJ 지우기 커맨드(`DELETE /mixer/announce/queue` 래핑)는 만들지 않는다. 예약 안내 미표시 결정과 정합하며, 길드 스로틀이 남용을 막는다.
3. **글자 예산 튜닝**: 초기값(병합 3초 · 클립 300자 · 1,000자/분) **유지** — 실사용 지표 보고 조정.
4. **긴 메시지 절단 vs 분할**: **v1은 300자 절단 고정**. 분할 순차 낭독은 후속 개선 후보.
5. **TTS 클립의 큐 UI 노출**: 명세대로 **노출 유지**(`TTS: <원문 앞 20자>`) + 재생 히스토리 제외.

PR 형태: **PR-C1/C2/C3를 별도 PR로 발행** (2026-10-18 확정).

---

## 부록: 근거가 된 코드 위치 (2026-10-18 조사 기준)

- 기존 TTS 호출부: `apps/bot/src/modules/audio/subcommands/tts.ts`, `apps/bot/src/services/aiTools/music.ts` (~479-502) — 둘 다 Google Translate URL → `mixerService.announce`.
- 채팅 리스너 선례: `apps/bot/src/modules/audio/listeners/commandChannel.ts`, `apps/bot/src/modules/general/listeners/message/customCommandPrefix.ts`.
- 정책 패턴: `apps/bot/src/services/aiChatService.ts` (`AiChatPolicy`, `assertChatEnabled`), `apps/bot/src/modules/general/commands/chatSettings.ts`.
- 설정 저장: `apps/bot/src/services/guildService.ts` (`getAiSettings` ~273), `packages/utils/src/redisChannels.ts`, `packages/prisma/src/schema.prisma` `model Guild` (15행부터).
- 대시보드: `apps/dashboard/src/types/settings.ts`, `lib/schemas.ts`, `app/api/servers/[id]/settings/route.ts`, `components/servers/ai-settings.tsx` (ChannelSelect).
- 재생: `apps/bot/src/services/audioService.ts`, `apps/bot/src/services/mixerService.ts` (`announce` ~318-324), mixer 계약 `../lavalink_mixer` openapi (`POST /mixer/announce`).
- 목업 비전: `apps/dashboard/src/components/home/previews/chat-tts-preview.tsx`, `mixer-preview.tsx`.
- siru_tts: `../siru_tts/integration.md`, `app/api/synthesis.py`, `app/schemas/models.py`, `app/core/cache.py`, `app/core/auth.py`, `app/settings.py`.
