TOTAL: 10 (HIGH:0 MEDIUM:2 LOW:8)

# 세그먼트 06: 대시보드 API 라우트 (apps/dashboard/src/app/api)

- 감사일: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 46개 route.ts (api 디렉터리 전체)
- 감사 방식: read-only. 46개 파일 전량 열람 + em dash/이모지/TODO/구분선/빈 라벨/엔드 마커/미사용 export/폴백 패턴/테스트 참조 전수 grep 검증.

## Findings

### 1. [MEDIUM] data-api 실패 응답 폴백 로직이 라우트마다 수작업 복제된다

- 위치: apps/dashboard/src/app/api/servers/[id]/channels/route.ts:33 (동일 패턴 14곳)
- 규칙: ai-slop-cleaner 체크리스트 3 (라우트 간 copy-paste 로직, 인증/검증/응답 헬퍼 중복)
- 사유: `result.message ?? FALLBACK` + `result.message ? result.status : 502` 응답 조립이 channels·roles·social 4파일·chzzk 2파일·youtube/twitch resolve·playlists/search 등 14곳에 복제돼 있고, 같은 레이어에 이미 테스트까지 있는 `dataApiFailResponse`(lib/data-api/client.ts:179, greeting preview/test 2라우트가 사용) 헬퍼가 있는데도 쓰지 않는다.
- 근거:

```ts
{ error: result.message ?? CHANNELS_FALLBACK },
{ status: result.message ? result.status : 502 },
```

- 제안: 502 폴백 wrap이 헬퍼와 동일한 14곳을 `dataApiFailResponse(result, FALLBACK)` 호출로 교체해 응답 계약을 한 곳으로 모읍니다.

### 2. [MEDIUM] bot-profile 아바타/배너 검증 블록이 복제되고 한도가 하드코딩된다

- 위치: apps/dashboard/src/app/api/servers/[id]/bot-profile/route.ts:63 (배너 동일 블록 :80)
- 규칙: ai-slop-cleaner 체크리스트 3 (copy-paste 로직)
- 사유: 크기 검증, MIME 검증, base64 data URI 변환, 리셋 플래그 처리가 필드명만 다르고 14줄짜리 블록으로 두 번 반복되며, 에러 메시지의 "최대 3MB"가 상수 MAX_AVATAR_BYTES(:9) 대신 문자열로 두 번 하드코딩돼 상수 변경 시 메시지가 어긋납니다.
- 근거:

```ts
if (avatarFile.size > MAX_AVATAR_BYTES) {
  return NextResponse.json({ error: "이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요." }, { status: 400 });
}
```

- 제안: `(file, field)`을 받는 로컬 헬퍼로 두 블록을 합치고, 메시지의 용량은 `Math.floor(MAX_AVATAR_BYTES / 1024 / 1024)`로 유도합니다 (assets/route.ts:77의 선례).

### 3. [LOW] 500 응답 본문의 영문 메시지가 전역 한국어 톤과 어긋난다

- 위치: apps/dashboard/src/app/api/tracks/route.ts:83, shards/route.ts:15·20, voice-servers/route.ts:15·19, data-api/route.ts:16·21, voice-servers/history/route.ts:24·28, servers/route.ts:74
- 규칙: 감사 기준 1 (유저 대상 응답/에러 메시지 copy 일관성, Quality Lock)
- 사유: 같은 앱의 나머지 오류 본문은 "~해요" 한국어 안내인데, 이 6개 파일의 실패 응답만 "Failed to fetch"/"Internal Server Error"/"Internal server error" 영문 원문 그대로 내려가 사용자에게 보이는 문구 톤이 끊깁니다.
- 근거:

```ts
{ error: "Failed to fetch tracks" },
```

- 제안: admin 대상이라도 한국어 안내("요청을 처리하지 못했어요." 등)로 통일합니다.

### 4. [LOW] 유튜브 메타데이터 폴백값 "Unknown Title"/"Unknown Artist"가 영문 그대로 노출된다

- 위치: apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:93
- 규칙: 감사 기준 1 (R-38 인접, 표시 문구 일관성)
- 사유: noembed 실패 시 한국어 UI에 "Unknown Title", "Unknown Artist"가 곡 제목·아티스트로 저장되어 그대로 표시됩니다. 정직한 폴백은 맞지만 언어만 어긋나는 값입니다.
- 근거:

```ts
let title = "Unknown Title";
let artist = "Unknown Artist";
```

- 제안: "제목 없음"/"아티스트 없음" 등 한국어 폴백값으로 바꿉니다.

### 5. [LOW] reorder 라우트에 단계 내레이션과 재서술 주석이 섞여 있다

- 위치: apps/dashboard/src/app/api/playlists/[id]/reorder/route.ts:56, 82, 111
- 규칙: antislop-code (Workflow Narration, Restating the Obvious)
- 사유: `// Fetch target track to move`, `// Run reordering inside a transaction`, `// 3. Move target track to destinationIndex`는 아래 코드가 이미 말하는 내용의 반복입니다. 다만 :84의 "-1 회피" 제약과 :92·:101의 시프트 범위 예시는 유일한 알고리즘 설명이라 보존해야 합니다.
- 근거:

```ts
// Run reordering inside a transaction
await db.$transaction(async (tx) => {
```

- 제안: 재서술 3줄과 번호 내레이션만 삭제하고 시프트 범위·-1 제약 주석은 남깁니다.

### 6. [LOW] 플레이리스트 트랙 라우트에 라인별 재서술 주석이 반복된다

- 위치: apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:92, 120, 162, 170, 230
- 규칙: antislop-code (Restating the Obvious, Line-by-Line Narration)
- 사유: `// Fetch metadata from noembed`, `// Upsert Track record`, `// Get current max position`, `// Create PlaylistTrack record`, `// Find the specific PlaylistTrack by position`은 바로 아래 코드가 이미 명시하는 동작을 다시 적습니다. 반면 :32의 "소유·개수 상한 검증이 본문 파싱보다 먼저예요"는 순서 제약을 알려주는 보존 가치 있는 주석입니다.
- 근거:

```ts
// Get current max position
const maxPositionResult = await db.playlistTrack.aggregate({
```

- 제안: 재서술 주석 5줄만 삭제하고 계약·제약 설명 주석은 유지합니다.

### 7. [LOW] stats 라우트의 "safe" 파싱 설명이 JSDoc과 인라인 주석에 중복된다

- 위치: apps/dashboard/src/app/api/servers/[id]/stats/route.ts:92
- 규칙: antislop-code (Restating the Obvious, 동일 정보 중복)
- 사유: :10-14 JSDoc이 "safe는 zod에서 파싱할 수 없어 사전에 분기하고 나머지는 coerce"를 설명한 뒤, 같은 내용을 :92 인라인 주석이 한 번 더 반복합니다.
- 근거:

```ts
// "safe"(전체 기간)는 스키마 밖에서 먼저 걸러요 — 나머지는 coerce 검증.
let days: number | "safe";
```

- 제안: 인라인 주석을 삭제하고 JSDoc 한 곳에 모읍니다.

### 8. [LOW] zod 스키마가 라우트 간에 동일 정의로 복제된다

- 위치: apps/dashboard/src/app/api/playlists/route.ts:14-29 = apps/dashboard/src/app/api/playlists/[id]/route.ts:13-28, apps/dashboard/src/app/api/playlists/search/route.ts:9 = apps/dashboard/src/app/api/servers/[id]/player/search/route.ts:13-15
- 규칙: ai-slop-cleaner 체크리스트 3 (zod 스키마 중복 정의)
- 사유: 플레이리스트 name/description 검증(길이·메시지 포함)이 create/update에 동일 복제돼 있고, `{ query: trim 1~200 }` 검색 스키마도 두 라우트에 각각 정의돼 변경 시 두 곳을 같이 고쳐야 합니다.
- 근거:

```ts
name: z.string().trim().min(1, "플레이리스트 이름을 입력해 주세요.")
  .max(50, "이름은 최대 50자까지 입력할 수 있어요."),
```

- 제안: 공용 스키마 조각(playlistNameSchema, searchQuerySchema)을 한 곳에 두고 양쪽에서 조합합니다.

### 9. [LOW] 라우트 파일 내부 순수 로직에 테스트가 없다

- 위치: apps/dashboard/src/app/api/tracks/route.ts:15-17, apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:115-118
- 규칙: ai-slop-cleaner 체크리스트 6 (테스트 누락, LOW)
- 사유: 대시보드 테스트 37개 파일 중 app/api를 참조하는 것은 타입 import뿐이라, 와일드카드 이스케이프(`escapeLikeWildcard`)와 제목 정규화 정규식 같은 DB·네트워크 의존이 없는 순수 로직이 회귀 검사 없이 라우트 파일에 남아 있습니다.
- 근거:

```ts
function escapeLikeWildcard(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
```

- 제안: 두 순수 함수를 lib로 옮기거나 최소한 스키마/정규식 단위 vitest를 추가합니다.

### 10. [LOW] import 문 쉼표 뒤 공백이 빠진 지점이 3곳 있다

- 위치: apps/dashboard/src/app/api/tracks/route.ts:6, apps/dashboard/src/app/api/servers/[id]/greeting/route.ts:3, apps/dashboard/src/app/api/servers/[id]/social/subscriptions/route.ts:7
- 규칙: ai-slop-cleaner 체크리스트 (형식화되지 않은 AI 생성 흔적)
- 사유: `publicReadLimit,rateKey`, `GreetingConfig,greetingConfigSchema`, `SocialSubscriptionResponse,SocialSubscriptionsResponse`처럼 쉼표 뒤 공백이 누락된 채 손으로 붙인 흔적이 남아 있어 포매터가 이 경로를 거치지 않았음을 보여줍니다.
- 근거:

```ts
import { guardRateLimit, publicReadLimit,rateKey } from "@/lib/rate-limit";
```

- 제안: 해당 파일을 포매터로 한 번 정리합니다.

## 검사했지만 문제 없는 항목

- R-02 (em dash): 유저에게 가는 더블/싱글 따옴표 문자열 전체 스캔에서 em dash 0건. 97줄의 em dash는 모두 코드 주석이고, 주석은 감사 기준 1의 대상이 아니며 기준 2의 금지 패턴(구분선/이모지/빈 라벨/엔드 마커)에도 해당하지 않습니다.
- R-16 (buzzwords)·챗봇 클로저·과장된 성공 문구: 0건. "AI 초안 생성"/"AI 수정"은 LLM 기능의 사실적 명칭이지 장식 배지가 아닙니다.
- R-17/R-36/R-38 (근거 없는 숫자·보장): 응답 메시지의 모든 숫자(3MB, 32자, 50자, 500자, 16개, 90일, 168시간, 커맨드/플레이리스트 상한)는 같은 파일의 상수 또는 zod 제약에 연결돼 있어 근거가 있습니다. "안전합니다"류 거짓 보장 0건. "잠시 후 다시 시도해 주세요"는 조치 가능한 안내이며 과장이 아닙니다.
- 주석 슬롭 금지 패턴 전수 검사: 구분선/박스 헤더 0건, 장식 이모지 0건, end marker 0건, 모호한 TODO 0건, 빈 라벨(// Main logic, // Error handling 등) 0건, JSDoc 시그니처 반복 0건.
- 보존 대상 주석 확인: SSRF 방지 계약(servers/[id]/player/play/route.ts:13), X-Forwarded-For 위조 제약(tracks/route.ts:21-22), IDOR fail-closed(servers/[id]/social/subscriptions/[subId]/route.ts:37-40), `rate: null` 면제 의도(servers/[id]/live/stream/route.ts:9-10, greeting/background/route.ts:7), TTL 폴백 동작(servers/[id]/settings/route.ts:98-100) 등 보안·프로토콜·트레이드오프 주석은 모두 정보 가치가 있어 그대로 두는 것이 맞습니다.
- 죽은 코드/미사용 export: 0건. stats 라우트의 StatsServerStatsResponse·LivePlayerState 타입은 컴포넌트가 type import해 사용 중이고, StatsTopTrack·StatsTopRequester도 같은 파일의 응답 계약에 쓰입니다.
- 잘못된 레이어 import: 0건. DB 접근은 @/lib/db, upstream은 data-api client 래퍼, 계약 스키마는 @sirubot/utils 서브패스 경유로 일관됩니다.
- 불필요 래퍼: 0건. toSummary(assets), readGuildMetaCache(greeting/preview), verifySubscriptionOwnership(subscriptions/[subId])는 각각 재사용·TTL 캐시·소유 검증 목적 있어 존재 이유가 분명합니다.
- 테스트 참조 검사: 대시보드 테스트 37개 파일 중 app/api 경로를 참조하는 파일은 player-live-tab.test.tsx(타입 import) 1개이며, 이를 findings 9로 기록했습니다.
