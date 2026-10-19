# 채팅 유틸 기능(이모지 확대·메시지 인용·임베드 복구·카운팅 채널) 명세서

> **상태**: 구현 완료 (feat/chat-tools → beta PR)
> **형태**: 기능 명세서 — 구현 결과와 계약을 기록해요.
> **Baseline**: `beta` @ `78556d9d` (2026-10-18), feature 브랜치 `feat/chat-tools`에서 구현.
> **출처**: `docs/plans/2026-10-16-feature-opportunities.md` 아이디어 목록 중 #1·#2·#3·#11을 선택.

---

## 0. TL;DR

| 항목 | 내용 |
| --- | --- |
| 한 줄 요약 | 채팅에 자동 반응하는 편의 기능 4종을 길드별로 켜고 끌 수 있게 만든다 |
| 이모지 확대 | 커스텀 이모지만으로 구성된 메시지 → CDN 큰 이미지(512px) 미디어 갤러리로 다시 전송 |
| 메시지 인용 | discord.com/channels/... 링크 → 자체 CV2 인용 카드 (같은 길드·공개·비NSFW 텍스트 채널만) |
| 임베드 복구 | X·인스타그램은 프로바이더 도메인 스왑 재전송, BOOTH는 OG 직접 읽어 원본 해상도 임베드 |
| 카운팅 채널 | 지정 채널에서 1부터 순서대로 세기(연속 금지), 틀리면 초기화, 최고 기록은 Redis에 영속 |
| 설정 | Guild 7필드 + 대시보드 "채팅 유틸" 탭, 기본값 전부 off |
| 계약 | 판정·정규화 순수 로직은 `packages/utils/src/chatTools.ts` (봇·대시보드 공유) |

## 1. 기능별 동작

### 1.1 이모지 확대 (`emojiEnlargeEnabled`)
- **판정**: `parseEmojiOnlyMessage(content)` — 공백으로 구분된 커스텀 이모지 토큰(`[a]?:name:id`) 1~10개만 인정. 텍스트·유니코드 이모지가 섞이면 무반응.
- **응답**: CV2 컨테이너 + 미디어 갤러리(`customEmojiUrl` — png/gif `?size=512&quality=lossless`), `-# 확대했어요` 캡션.
- **쿨다운**: 길드+유저 5초 (`MemoryCache`).

### 1.2 메시지 인용 (`quoteEnabled`)
- **판정**: `parseMessageLinks(content, 3)` — `<...>`로 감싼 링크는 미리보기 끄기 의도라 스킵, 중복 제거. 같은 길드 링크만.
- **가드**: 소스 채널이 텍스트 기반 + 스레드 아님, `nsfw` 아니어야 하고, `@everyone` 역할 overwrite가 `ViewChannel`을 deny하면(비공개 채널) 인용하지 않음. 원본 메시지 조회 실패는 조용히 스킵.
- **응답**: CV2 섹션(작성자 아바타 썸네일 + username + `<t:..:R>` 시간 + 본문 500자 스니펫 + 채널 멘션), 첨부 이미지 최대 4장 미디어 갤러리.
- **쿨다운**: 길드+유저 3초.

### 1.3 임베드 복구 (`embedFixEnabled` + `embedFixSites[]` + `embedFixSuppressOriginal`)
- **판정**: `findEmbedFixLinks(content, sites)` — 감싼 링크 스킵, 도메인 시작 경계 룩비하인드(`(?<![\w.-])`)로 유사 도메인 오탐 방지, 최대 2개.
- **X**: `twitter.com`→`fxtwitter.com`, `x.com`→`fixupx.com` (FxEmbed, 2026-10-18 기준 활성·상태 페이지 있음). `/photo/N` 접미사 유지, `?s=20` 등 추적 쿼리 제거.
- **인스타그램**: `instagram.com/(p|reel|reels|tv)/...`→`kkinstagram.com/...` (KKInstagram). **프로바이더는 외부 서비스라 불안정** — `INSTAGRAM_FIX_DOMAIN` 상수 교체로 대응 (InstaFix 아카이브 이슈 참고).
- **BOOTH**: 전용 fixer가 없어 `fetch`(UA `Discordbot/2.0`, 10초 타임아웃) → `parseBoothOg(html)` → CV2 상품 카드(제목 섹션 + 설명 350자 + 원본 해상도 미디어 갤러리). `enlargeBoothImage`가 pximg `/c/620x620/` 리사이즈 세그먼트를 제거해 원본 해상도를 써요. OG 실패(삭제 상품 등)면 원본 임베드에 맡김.
- **원본 억제**: `embedFixSuppressOriginal` 켜짐 + 봇에게 `ManageMessages` 있으면 `message.suppressEmbeds(true)`. Discord unfurl 경합(원본 임베드가 이미 떴는지)은 보장하지 않아요.
- **쿨다운**: 길드+유저 3초.

### 1.4 카운팅 채널 (`countingEnabled` + `countingChannelId`)
- **판정**: `parseCountingMessage` — 순수 숫자만(≤15자리). 다른 텍스트·잡담은 무시(카운팅 채널에서 잡담 허용).
- **규칙**: `evaluateCounting(state, attempt, userId)` — 정답은 `current + 1`, **같은 사람 연속 금지**(도배 방지). 실패 시 0으로 초기화, `best`(최고 기록)는 유지.
- **상태**: 샤드 메모리 `Map`(항상 최신) + Redis 해시 `sirubot:counting:<guildId>`(`current`/`lastUserId`/`best`, 재시작 복구용). 길드는 한 샤드에만 속해 경합이 없어요. Redis 없는 개발 환경은 메모리만으로 동작(재시작 시 초기화).
- **응답**: 성공은 조용히. 최고 기록 갱신은 10 이상일 때만 알림. 실패 시 사유(연속/틀림)+기록 안내, 이미 0이면 잡담처럼 무반응.
- **제한**: 대상은 지정 채널 1개. 스레드·다른 채널은 무시.

## 2. 저장 계약

### Prisma `Guild` (마이그레이션 `20261018180000_chat_tools_features`)
```
emojiEnlargeEnabled Boolean @default(false)
quoteEnabled        Boolean @default(false)
embedFixEnabled        Boolean  @default(false)
embedFixSites          String[] @default(["x","instagram","booth"])
embedFixSuppressOriginal Boolean @default(false)
countingEnabled  Boolean @default(false)
countingChannelId String?
```

### 대시보드
- `GET/PUT /api/servers/[id]/settings` 확장 — ALLOWED_KEYS + zod `guildSettingsSchema`(사이트 enum은 `EMBED_FIX_SITES` 계약 공유) + `toSettings` 기본값(봇 기본값과 동일).
- "채팅 유틸" 탭(`server-dashboard.tsx` TABS `chat-tools`, `channels` 뒤) → `chat-tools-settings.tsx` 패널: 기능별 `SectionLabel` + `Switch`, 사이트 3종 토글(순서는 계약 순서 유지), 카운팅 채널 `ChannelSelect`.
- 저장 후 `notifyGuildSettingsChanged` → 봇 캐시 무효화(최대 60초 TTL 폴백).

## 3. 비범위 (의도적 제외)
- 다른 길드·DM 메시지 링크 인용 (원본 임베드만으로 충분)
- 임베드 복구 원본 메시지 삭제·웹훅 재전송 방식(Embed Fixer 스타일) — 원본 보존이 채택한 방식
- 카운팅 리더보드·통계 커맨드, 실패 시 실패한 숫자로 되돌아가는 변형 규칙
- TikTok·Reddit·Pixiv 등 추가 사이트 (사이트 enum 확장으로 나중에 추가 가능)

## 4. 검증
- `packages/utils` vitest 25개 신규 테스트(계약) + 전체 122개 통과
- 봇 typecheck·prettier 통과, 기존 319개 테스트 통과
- 대시보드 eslint 0 경고·tsc 통과, 86개 테스트 통과
- 마이그레이션 `migrate dev` 로컬 DB 적용 확인 (기존 `TtsUserSetting.updatedAt` 기본값 drift는 본 변경과 무관해 그대로 둠)
- 실제 디스코드 메시지 동작(각 기능의 임베드·인용·카운팅 응답)은 미검증 — 병합 후 운영에서 확인 필요