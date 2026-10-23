TOTAL: 11 (HIGH:0 MEDIUM:6 LOW:5)

# 세그먼트 09: 대시보드 lib/hooks (apps/dashboard/src/lib, apps/dashboard/src/hooks)

- 감사일: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 75개 (lib 64개, hooks 11개, src 최상위 .ts/.tsx 0개. 이 중 테스트 파일 23개 포함)
- 감사 범위: lib/**, hooks/**, src 최상위 파일만. components/와 app/는 범위 밖(각각 세그먼트 08, 05).
- 감사 방식: read-only. lib/hooks 전량 열람 + em dash/이모지/TODO/구분선/단계 내레이션/빈 라벨/엔드 마커/영문 CTA/버즈워드/미사용 export/테스트 파일 유무 전수 grep 검증. 수정·빌드·테스트 실행 없음.

## Findings

### 1. [MEDIUM] 본문 error 메시지 추출 로직이 3곳에 중복 구현된다

- 위치: apps/dashboard/src/lib/api-error.ts:12 (표준 구현), apps/dashboard/src/hooks/use-social-alerts.ts:46, apps/dashboard/src/hooks/use-playlists.ts:139
- 규칙: 감사 기준 2 (AI 코드 슬롭: 응답/에러 헬퍼 중복)
- 사유: "JSON 본문의 error 문자열이 있으면 그걸 쓰고 없으면 폴백"이라는 같은 규칙이 `toApiError`(ApiError에 status·retryable 보존), `readError`(문자열만 반환, status 소실), `callApi`의 인라인 `new Error(data.error || failure)`(ApiError 아예 안 씀)로 세 번 구현돼, 같은 실패라도 재시도 안내와 401 리다이렉트 붙는지가 홀마다 달라진다. use-social-alerts의 쓰기/삭제 실패는 status를 잃어 다른 길드 훅과 달리 401 시 로그인 안내가 없다.
- 근거:

```ts
async function readError(res: Response, fallback: string): Promise<string> {
	const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
	return typeof payload?.error === "string" && payload.error.trim() ? payload.error : fallback;
```

- 제안: `readError`와 `callApi`의 추출 로직을 `toApiError(res, fallback)` 호출로 바꾸고 message만 꺼내 쓰게 해 재시도/401 계약을 한 곳으로 모은다.

### 2. [MEDIUM] data-api 클라이언트 안에서 실패 메시지 추출 블록 3회, 키 미설정 가드 4회가 복제된다

- 위치: apps/dashboard/src/lib/data-api/client.ts:118 (동일 블록 :157, :212), apps/dashboard/src/lib/data-api/client.ts:17 (동일 가드 :99, :145, :197)
- 규칙: 감사 기준 2 (AI 코드 슬롭: 헬퍼 중복)
- 사유: `res.json().catch(() => null)` 후 `message` 유효성 검사 후 `{ok:false, status, message}` 반환하는 10줄 블록이 forwardDataApiPost/Get/Image에 그대로 복사돼 있고, 인증 키 미설정 시 동일 문자열 경고 후 503을 돌려주는 가드도 4곳에 복제된다. 게다가 postDataApi(:69)와 openDataApiStream(:46)은 같은 미설정 경로에서 경고 없이 조용히 null을 돌려 로깅이 들쭉날쭉하다.
- 근거:

```ts
const payload = (await res.json().catch(() => null)) as {
  message?: unknown;
} | null;
```

- 제안: `requireDataApi()`(키 확인 + 경고 + 503 실패 봉투)와 `readForwardFail(res)` 헬퍼를 파일 안에 두고 7개 지점에서 호출하게 바꾼다.

### 3. [MEDIUM] 캐시 TTL 판정이 같은 파일 안에서 두 번 계산된다

- 위치: apps/dashboard/src/lib/guild-permissions.ts:60 (writeCache 내부 삼항), apps/dashboard/src/lib/guild-permissions.ts:89 (cacheTtlMs)
- 규칙: 감사 기준 2 (AI 코드 슬롭: 중복 로직)
- 사유: 결과별 TTL(ok 60초, unavailable 10초, invalid-token 0) 매핑이 `writeCache` 안의 삼항과 `cacheTtlMs` 함수에 똑같이 구현돼 있다. 한쪽 주석(:88)이 "인메모리 writeCache와 동일해요"라고 따라 쓰고 있을 만큼 값이 어긋나면 인메모리와 Redis 캐시 수명이 갈라진다.
- 근거:

```ts
const ttl =
  result.status === "ok"
    ? OK_CACHE_TTL_MS
```

- 제안: `writeCache`의 삼항을 `cacheTtlMs(result)` 호출로 교체해 TTL 원본을 한 곳으로 줄인다.

### 4. [MEDIUM] zod 본문 검증 400 흐름이 두 구현으로 갈리고 미등록 키 처리가 달라진다

- 위치: apps/dashboard/src/lib/api-handler.ts:127, apps/dashboard/src/lib/schemas.ts:150 (parseSettingBody)
- 규칙: 감사 기준 2 (AI 코드 슬롭: zod 검증 헬퍼 중복)
- 사유: "JSON 파싱 실패 → safeParse → zodError로 400 응답"의 핵심이 api-handler의 schema 분기와 parseSettingBody에 각각 구현돼 있고, parseSettingBody는 미등록 키를 400으로 거절하는데(:160) api-handler 경로는 검사조차 없다. schema 옵션을 쓴 라우트와 parseSettingBody를 쓴 라우트 사이에 본문 계약이 실제로 어긋난다.
- 근거:

```ts
const parsed = options.schema.safeParse(await request.json().catch(() => null));
if (!parsed.success) {
	return NextResponse.json({ error: options.invalidMessage ?? zodError(parsed.error) }, { status: 400 });
```

- 제안: api-handler의 schema 분기도 `parseSettingBody(request, schema, allowedKeys)`를 부르게 해 미등록 키 검사까지 경로를 하나로 합친다.

### 5. [MEDIUM] SWR fetcher가 두 구현으로 갈리고 한쪽은 영문 에러 메시지를 던진다

- 위치: apps/dashboard/src/lib/fetcher.ts:3, apps/dashboard/src/lib/swr.ts:38 (createApiFetcher)
- 규칙: 감사 기준 2 (fetcher 헬퍼 중복), 감사 기준 3 (유저 대상 문자열 일관성)
- 사유: 전역 SWR 기본 fetcher는 단순 `fetch + !ok throw`로 영문 메시지를 던지고, 공용 팩토리인 createApiFetcher는 서버의 한국어 메시지를 담은 ApiError를 던져 fetcher를 명시적으로 안 넘긴 useSWR(예: use-playlists의 상세·검색 조회)은 실패 시 ApiError 계약 밖 영문 메시지가 흘러간다. 같은 앱에서 실패 문구의 출처가 두 개다.
- 근거:

```ts
export async function fetcher<T = unknown>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Network response was not ok");
```

- 제안: 전역 기본 fetcher도 `toApiError(res, fallback)`을 쓰게 하고, 이중 구현을 createApiFetcher 한 곳으로 모은다 (단, 화면 표시 여부는 components/ 범위 밖이라 추가 확인 필요).

### 6. [MEDIUM] 프로필 집계 수치의 샘플링 한도가 일부 통계에만 고지된다

- 위치: apps/dashboard/src/lib/profile-stats.ts:86 (샘플 상수), apps/dashboard/src/lib/profile-stats.ts:172 (rps 승패 집계), apps/dashboard/src/lib/profile-stats.ts:201 (listenSampled)
- 규칙: 감사 기준 4 (R-17 출처 확인)
- 사유: 청취 시간은 500건 샘플임을 알리는 `listenSampled` 플래그가 있는데(:201), 가위바위보 승/패/연승은 최근 5000건(:87, :123), 숫자맞추기 최소 시도는 최근 1000건(:88, :129)을 넘겨버리면 조용히 어긋나는데 고지 수단이 없다. 무출처 수치는 아니지만(모두 DB 실제 기록), 사용자에게 그대로 보이는 통계라 출처 확인 대상이다. 화면 표시 여부는 app/components가 범위 밖이라 미확인.
- 근거:

```ts
const LISTEN_SAMPLE_LIMIT = 500;
const RPS_SAMPLE_LIMIT = 5000;
const GUESS_SAMPLE_LIMIT = 1000;
```

- 제안: rps·guess 결과에도 `sampled` 플래그를 붙이거나 집계를 DB aggregate 쿼리로 바꿔 원본 전체 수치를 쓰게 한다.

### 7. [LOW] 함수 이름을 그대로 반복하는 주석이 두 줄 있다

- 위치: apps/dashboard/src/lib/discord-cdn.ts:1, apps/dashboard/src/lib/discord-cdn.ts:6
- 규칙: antislop-code "Restating the Obvious" (재서술)
- 사유: `discordAvatarUrl` 위의 "Build Discord CDN avatar URL"은 선언이 이미 말하는 것 외에 아무 정보도 더하지 않는 시그니처 반복이고, `discordGuildIconUrl` 위 주석도 같은 형식이다.
- 근거:

```ts
/** Build Discord CDN avatar URL */
export function discordAvatarUrl(userId: string, avatarHash: string, size = 128): string {
```

- 제안: size 기본값(128)처럼 코드에 없는 사실 하나를 남기거나 주석을 지운다.

### 8. [LOW] 주석이 존재하지 않는 옛 파일을 가리킨다

- 위치: apps/dashboard/src/lib/env.ts:23
- 규칙: antislop-code "Over-Explained Comment" (버전 히스토리/옛 참조 페널티)
- 사유: "기존 lib/data-api.ts와 동일"이라 적었지만 현재 트리에는 lib/data-api/ 디렉터리만 있고 lib/data-api.ts 파일은 없다. 다음 사람이 대조하려다 허무하게 검색부터 하게 되는 스테일 참조다.
- 근거:

```ts
// data-api 계약: 둘 중 하나만 있어도 동작. || 이라서 빈 문자열도 폴백해요 (기존 lib/data-api.ts와 동일).
```

- 제안: || 폴백이 빈 문자열까지 잡는 이유만 남기고 사라진 파일 참조를 삭제한다.

### 9. [LOW] 미사용 export와 내부 전용 export가 섞여 있다

- 위치: apps/dashboard/src/lib/discord-cdn.ts:2 (discordAvatarUrl 전소스 미사용), apps/dashboard/src/lib/schemas.ts:131 (unknownKeys 같은 파일에서만 사용), apps/dashboard/src/lib/token-store.ts:144, apps/dashboard/src/lib/token-store.ts:166, apps/dashboard/src/lib/token-store.ts:186
- 규칙: 감사 기준 2 (죽은 코드/미사용 export)
- 사유: `discordAvatarUrl`은 apps/dashboard/src 전체에서 정의부 외 참조가 없다(아바타 URL은 어디서도 쓰지 않고 아이콘 URL만 사용). `unknownKeys`와 token-store의 세 함수는 export돼 있지만 호출부가 전부 같은 파일 안이라 public 계약으로 보여주지 않는다.
- 근거:

```ts
export function unknownKeys(body: unknown, allowed: readonly string[]): string[] {
```

- 제안: 미사용인 `discordAvatarUrl`은 삭제(또는 사용처 추가), 내부 전용 함수는 export를 뺀다.

### 10. [LOW] 훅 11개 중 테스트가 1개뿐이고 lib 20개 모듈이 무테스트다

- 위치: apps/dashboard/src/hooks/use-playlists.ts:1 (테스트 없음, use-guild-settings 외 전부), apps/dashboard/src/lib/storage.ts:1, apps/dashboard/src/lib/notify.ts:1, apps/dashboard/src/lib/profile-stats.ts:1
- 규칙: 감사 기준 2 (테스트 누락, LOW)
- 사유: hooks는 use-guild-settings.test.tsx 하나만 있고, lib은 42개 비테스트 파일 중 20개(storage, notify, profile-stats, session-token, redis, auth, greeting-image, custom-commands 등)에 대응 테스트가 없다. 알림 문구·집계 로직·토큰 세션이 회귀해도 잡히지 않는 구간이다.
- 근거:

```text
hooks 미테스트 9개: use-social-alerts, use-playlists, use-member-greeting, use-bot-profile, use-guild-assets 외 4개
lib 미테스트 20개: storage, notify, profile-stats, session-token, redis, auth, greeting-image, custom-commands 외 12개
```

- 제안: 사용자 문구와 집계 수치를 직접 만드는 storage/notify/profile-stats 세 모듈부터 회귀 테스트를 먼저 붙인다.

### 11. [LOW] lib 레이어가 components 레이어를 임포트한다

- 위치: apps/dashboard/src/lib/notify.ts:3
- 규칙: 감사 기준 2 (잘못된 레이어 import)
- 사유: lib은 components가 참조하는 하위 레이어인데 notify.ts만 `@/components/ui/toast`를 올라타 역방향 참조가 된다. 현재 단방향이라 순환은 없지만, hooks/use-guild-assets와 use-playlists처럼 같은 토스트를 직접 쓰는 곳과 훅 레이어가 갈라진다.
- 근거:

```ts
import { toast } from "@/components/ui/toast";
```

- 제안: notify.ts를 hooks 디렉터리로 옮기거나, 토스트 호출을 인자로 받는 순수 헬퍼로 바꿔 lib이 UI 모듈을 모르게 한다.

## 검사했지만 문제 없는 항목

- 주석 슬롭 패턴 전수 검사: 구분선(=, - 반복 배너), TODO/FIXME, 장식 이모지, end marker, 단계 내레이션(Step/N번째/먼저·다음으로), 빈 라벨(Main logic, Helper function, Entry point), ALL CAPS 라벨 검색 결과 0건.
- 유저 대상 문자열(알림·에러·버튼 상수·zod 안내)의 em dash(U+2014) 포함 0건. 큰따옴표 문자열 안 대시 기호는 lib에 36건이 있으나 전부 테스트 describe/it 이름과 console.warn 로그였고 hooks는 0건이라 감사 기준 3의 범위 밖이다.
- 감사 기준 3의 나머지: 범용 CTA(시작하기/더 알아보기/Get Started), AI 버즈워드(seamless/혁신적/무제한/100%), 이모지 장식, 챗봇 클로저(도움이 되셨나요류) 검색 결과 0건.
- 감사 기준 4의 나머지 숫자: "최대 3MB"(greeting-image.ts:8 상수와 같은 수치), "최대 500개/15초/0.5초/99" 등 zod 메시지는 모두 같은 줄의 `.max/.min` 경계와 동일해 출처가 코드 안에 있다. rate-limit의 "분당 12회"류 주석도 같은 파일의 RateRule 상수를 가리킨다.
- R-27(UI 상태) 관련: 훅들이 전부 isLoading/error/null 데이터를 일관된 형태로 내보내 화면이 세 상태를 만들 재료를 갖췄다.
- R-32(키보드) 관련: lib/utils.ts:36 `radioArrowKeyDown`이 좌우 순환 키보드 이동을 공용으로 제공한다.
- format.ts의 상대시간 헬퍼 2개(formatRelativeTime, formatRelativeTimeFromISO)는 "방금 전" 표기(하트비트)와 "방금" 표기 + 7일 후 절대 날짜(재생 기록)로 표기 계약이 다르고 그 이유가 주석(:7, :16)에 적혀 있어 중복으로 보지 않는다.
- 스키마 이중 정의: GUILD_SETTING_KEYS/GuildSettings/GUILD_SETTINGS_DEFAULTS가 guildSettingsSchema shape에서만 파생되고(schemas.ts:73-77), 스키마 키·Prisma @default 일치를 테스트가 잠그고 있다.
- 주석이 실제 정보를 담는 구간(보존 대상): rate-limit.ts:26-31 Lua 시드/클록 오차, token-store.ts 전체의 뮤텍스·낙관 잠금 설명, guild-permissions.ts:42-46 단일 비행 사유, env.ts:3-13 재해석·fail-open 계약, auth.ts:13-14 issuer 검증 워크어라운드, redis.ts:118-121 Redlock 안전 해제. 모두 제거 대상이 아니다.
