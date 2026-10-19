# 채팅 유틸 기능(이모지 확대·메시지 인용·임베드 복구·카운팅 채널) 명세서

> **상태**: 구현 완료 (feat/chat-tools → beta PR) — 2차: 채널 단위 on/off·봇 명령어·임베드 CV2 카드·웹훅 릴레이 추가 / 3차: 임베드 복구 사이트 4종(TikTok·Reddit·Pixiv·Threads) OG 카드 추가
> **형태**: 기능 명세서 — 구현 결과와 계약을 기록해요.
> **Baseline**: `beta` @ `78556d9d` (2026-10-18), feature 브랜치 `feat/chat-tools`에서 구현.
> **출처**: `docs/plans/2026-10-16-feature-opportunities.md` 아이디어 목록 중 #1·#2·#3·#11을 선택.

---

## 0. TL;DR

| 항목 | 내용 |
| --- | --- |
| 한 줄 요약 | 채팅에 자동 반응하는 편의 기능 4종을 채널 단위로 켜고 끈다 (대시보드 + `/채팅유틸` 명령어) |
| 이모지 확대 | 커스텀 이모지만으로 구성된 메시지 → CDN 큰 이미지(512px) 미디어 갤러리로 다시 전송 |
| 메시지 인용 | discord.com/channels/... 링크 → 자체 CV2 인용 카드 (같은 길드·공개·비NSFW 텍스트 채널만) |
| 임베드 복구 | X·인스타그램·BOOTH·TikTok·Reddit·Pixiv·Threads 메타데이터를 data-api 게이트웨이(30분 캐시)로 조회 → CV2 카드를 원작자 이름·프사 웹훅으로 전송. 게이트웨이 불가 시 레거시 링크 스왑 폴백 |
| 카운팅 채널 | 지정 채널에서 1부터 순서대로 세기(연속 금지), 틀리면 초기화, 최고 기록은 Redis에 영속 |
| 채널 정책 | 이모지 확대·인용·임베드 복구는 각각 `all` / `channels` / `off` 모드 + 허용 채널 목록 (AI 채팅·TTS와 같은 토글 규칙) |
| 설정 | Guild 필드(아래) + 대시보드 "채팅 유틸" 탭 + 봇 `/채팅유틸 채널|카운팅` 명령어, 기본값 전부 off |
| 계약 | 판정·정규화·X 메타데이터·게이트웨이 스키마는 `packages/utils/src/chatTools.ts` (봇·data-api·대시보드 공유) |

## 1. 기능별 동작

### 1.1 이모지 확대 (`emojiEnlargeMode` + `emojiEnlargeChannelIds`)
- **채널 게이트**: `isChannelToggleEnabled(settings.emojiEnlarge, channelId)` — off면 무반응, all이면 항상, channels면 목록에 있을 때만.
- **판정**: `parseEmojiOnlyMessage(content)` — 공백으로 구분된 커스텀 이모지 토큰(`[a]?:name:id`) 1~10개만 인정. 텍스트·유니코드 이모지가 섞이면 무반응.
- **응답**: CV2 컨테이너 + 미디어 갤러리(`customEmojiUrl` — png/gif `?size=512&quality=lossless`), `-# 확대했어요` 캡션.
- **쿨다운**: 길드+유저 5초 (`MemoryCache`).

### 1.2 메시지 인용 (`quoteMode` + `quoteChannelIds`)
- **채널 게이트**: `isChannelToggleEnabled(settings.quote, channelId)`.
- **판정**: `parseMessageLinks(content, 3)` — `<...>`로 감싼 링크는 미리보기 끄기 의도라 스킵, 중복 제거. 같은 길드 링크만.
- **가드**: 소스 채널이 텍스트 기반 + 스레드 아님, `nsfw` 아니어야 하고, `@everyone` 역할 overwrite가 `ViewChannel`을 deny하면(비공개 채널) 인용하지 않음. 원본 메시지 조회 실패는 조용히 스킵.
- **응답**: CV2 섹션(작성자 아바타 썸네일 + username + `<t:..:R>` 시간 + 본문 500자 스니펫 + 채널 멘션), 첨부 이미지 최대 4장 미디어 갤러리.
- **쿨다운**: 길드+유저 3초.

### 1.3 임베드 복구 (`embedFixMode` + `embedFixChannelIds` + `embedFixSites[]` + `embedFixSuppressOriginal`)
- **채널 게이트**: `isChannelToggleEnabled(settings.embedFix, channelId)`.
- **판정**: `findEmbedFixLinks(content, sites)` — 감싼 링크 스킵, 도메인 시작 경계 룩비하인드(`(?<![\w.-])`)로 유사 도메인 오탐 방지, 최대 2개.
- **메타데이터 게이트웨이 (1차 경로)**: 봇이 data-api `POST /v1/embed-fix/metadata`에 링크 목록(site·url·fixedUrl)을 보내요.
  - data-api는 사이트별 `serveCached`(30분, 서킷 브레이커, 프로바이더 `fxtwitter`/`kkinstagram`/`booth`/`tnktok`/`vxreddit`/`phixiv`/`fixthreads`)로 조회해요.
  - **X**: `api.fxtwitter.com`(FxEmbed API)에서 텍스트·작성자·아바타(_400x400)·사진(name=large)·카운트·생성 시각을 받아 `card` 모드로. 동영상·투표·인용 트윗은 카드가 어려워 `link` 모드(고친 링크만).
  - **인스타그램**: kkinstagram 고친 링크가 실제 이미지(302 → fbcdn)로 열리는지만 확인해 `card`(이미지 갤러리) 또는 `link`. 캡션·작성자 메타는 프로바이더가 안 줘요.
  - **BOOTH**: OG 직접 fetch(UA `Discordbot/2.0`) → `parseBoothOg` → `card`(제목·설명 350자·원본 해상도 이미지). 실패(삭제 상품 등)면 `skip`.
  - **OG 카드 사이트(TikTok·Reddit·Pixiv·Threads)**: 고친 주소(tnktok·vxreddit·phixiv·fixthreads.seria.moe)의 og 메타를 `parseOgMeta`로 읽어 `card`(제목·설명 350자·이미지, TikTok은 og:video까지)를 만들어요. 메타가 없으면 `link`(고친 링크) 폴백. 프로바이더들은 Discord 크롤러 UA에만 og 태그를 내려서 Discordbot UA로 조회해요.
  - 도메인 실패(삭제 트윗 등)는 캐시·브레이커 오염 없이 `link`/`skip`으로만 흘러요. 게이트웨이 전체 실패 시 봇은 레거시 폴백(X/인스타 링크 스왑 안내, BOOTH 직접 OG)으로 동작해요.
- **전송 (웹훅 릴레이)**: 결과 카드(CV2)·링크를 **원작자 표시 이름 + 프사**로 보내요 — 채널에 봇 소유 웹훅(`SiruBOT 임베드`)을 찾아/만들어 전송(60초 캐시). 스레드(웹훅 생성 불가)·`ManageWebhooks` 권한 없음·전송 실패면 `message.reply` 봇 아이디 폴백. **원본 메시지는 절대 지우지 않아요.**
- **X 카드 레이아웃**: 작성자 섹션(이름 + `-# @handle` + 아바타 썸네일) + 본문 + 사진 갤러리(최대 10장) + 하단 섹션(답글·리포스트·좋아요 수 + `<t:..:R>` + `원문 보기` 링크 버튼).
- **OG 카드 레이아웃**: 사이트 헤더(`-# TikTok 영상/Reddit 게시물/Pixiv 작품/Threads 게시물` + `원문 보기` 버튼) + `## 제목` + 설명(1000자 상한) + 미디어 갤러리(og:video 우선, 이미지 최대 10장).
- **프로바이더 상비 교체**: 외부 fix 서비스는 불안정 — fix 도메인 상수(`TIKTOK/REDDIT/PIXIV/THREADS_FIX_DOMAIN` 등)와 data-api 프로바이더 함수 교체로 대응 (InstaFix 아카이브 이슈·tfxktok 폐쇄 참고).
- **원본 억제**: `embedFixSuppressOriginal` 켜짐 + 봇에게 `ManageMessages` 있으면 `message.suppressEmbeds(true)`.
- **쿨다운**: 길드+유저 3초.

### 1.4 카운팅 채널 (`countingEnabled` + `countingChannelId`)
- **판정**: `parseCountingMessage` — 순수 숫자만(≤15자리). 다른 텍스트·잡담은 무시(카운팅 채널에서 잡담 허용).
- **규칙**: `evaluateCounting(state, attempt, userId)` — 정답은 `current + 1`, **같은 사람 연속 금지**(도배 방지). 실패 시 0으로 초기화, `best`(최고 기록)는 유지.
- **상태**: `apps/bot/src/services/countingState.ts` — 샤드 메모리 `Map`(항상 최신) + Redis 해시 `sirubot:counting:<guildId>`(`current`/`lastUserId`/`best`, 재시작 복구용). Redis 없는 개발 환경은 메모리만으로 동작(재시작 시 초기화).
- **응답**: 성공은 조용히. 최고 기록 갱신은 10 이상일 때만 알림. 실패 시 사유(연속/틀림)+기록 안내, 이미 0이면 잡담처럼 무반응.
- **제한**: 대상은 지정 채널 1개. 스레드·다른 채널은 무시.

## 2. 설정·명령어

### 봇 명령어 `/채팅유틸` (`chatTools.ts`, `ManageGuild` 권한)
- `/채팅유틸 채널 <기능> <켜기|끄기>` — 이 채널에서 이모지 확대·메시지 인용·임베드 복구를 켜고 꺼요. `setChannelChatToolEnabled`가 AI 채팅·TTS와 같은 토글 규칙(off → channels+[채널], all 끄기 → 나머지 채널 승계)으로 계산해요.
- `/채팅유틸 카운팅 [채널] [지정|끄기]` — 카운팅 채널 지정(기본: 현재 채널)·해제. 상태는 새로 시작해요.

### Prisma `Guild` (마이그레이션 `20261019000000_chat_tools_per_channel`)
```
emojiEnlargeMode        String   @default("off")  // all | channels | off
emojiEnlargeChannelIds  String[] @default([])
quoteMode               String   @default("off")
quoteChannelIds         String[] @default([])
embedFixMode            String   @default("off")
embedFixChannelIds      String[] @default([])
embedFixSites           String[] @default([])  // 기본은 전부 꺼짐 — 원하는 사이트를 직접 골라 켜요
embedFixSuppressOriginal Boolean @default(false)
countingEnabled         Boolean  @default(false)
countingChannelId       String?
```
1차 구현의 boolean 3개(`emojiEnlargeEnabled`·`quoteEnabled`·`embedFixEnabled`)는 채널 토글 모델로 대체(삭제)했어요. 마이그레이션은 DROP + ADD로 기존 on/off 값은 계승하지 않아요(기본 off).

### 대시보드
- `GET/PUT /api/servers/[id]/settings` 확장 — ALLOWED_KEYS + zod `guildSettingsSchema`(모드 enum·채널 snowflake 배열·사이트 enum은 `EMBED_FIX_SITES` 계약 공유) + `toSettings` 기본값(봇 기본값과 동일).
- "채팅 유틸" 탭(`chat-tools-settings.tsx`) — 기능별 3개 모드 라디오카드(all/channels/off, AI 설정 패널 패턴) + `channels`일 때 다중 채널 선택 + 임베드 사이트 7종 토글(기본 전부 꺼짐) + 원본 억제 스위치 + 카운팅 채널 선택.
- 저장 후 `notifyGuildSettingsChanged` → 봇 캐시 무효화(최대 60초 TTL 폴백).

## 3. 비범위 (의도적 제외)
- 다른 길드·DM 메시지 링크 인용 (원본 임베드만으로 충분)
- 임베드 복구 원본 메시지 **삭제**(Embed Fixer 스타일) — 원본 보존 + 웹훅 릴레이를 채택했어요
- 카운팅 리더보드·통계 커맨드, 실패 시 실패한 숫자로 되돌아가는 변형 규칙
- 임베드 복구의 디스코드 **스레드** 지원 — 웹훅 생성이 안 돼 봇 아이디 폴백으로만 동작(요청에서 제외됨)
- X 동영상 카드(임베드 불가 구조) — 링크 모드로만. TikTok은 og:video를 받아 카드로 심어요

## 4. 검증
- `packages/utils` vitest 38개 신규 테스트(X 메타데이터 파싱·게이트웨이 스키마 포함) + 전체 135개 통과
- 봇 typecheck·prettier 통과, 326개 테스트 통과 (채팅유틸 채널 토글·카운팅 설정 테스트 신규)
- data-api typecheck·prettier 통과, 111개 테스트 통과 (임베드 복구 프로바이더 매핑 8개 신규)
- 대시보드 eslint 0 경고·tsc 통과, 86개 테스트 통과, `next build --turbopack` 성공
- 마이그레이션 `migrate dev` 로컬 DB 적용 확인 (기존 `TtsUserSetting.updatedAt` 기본값 drift는 본 변경과 무관해 그대로 둠)
- 실제 디스코드 메시지 동작(각 기능의 카드·인용·카운팅 응답, 웹훅 원작자 프사·이름 표시, data-api 게이트웨이 실호출)은 미검증 — 병합 후 운영에서 확인 필요