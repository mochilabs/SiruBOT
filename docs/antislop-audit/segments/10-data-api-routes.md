TOTAL: 15 (HIGH:1 MEDIUM:6 LOW:8)

# data-api 라우트/플러그인/설정 antislop 감사 (세그먼트 10)

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `apps/data-api/src/routes/**`, `apps/data-api/src/plugins/**`, `apps/data-api/src/config/**` (services/providers/renderers/utils는 범위 밖)
- 감사 파일 수: 21개 (routes 18 [테스트 3 포함] · plugins 2 [테스트 1 포함] · config 1)
- 로드 스킬: antislop, antislop-code, antislop-copywriting, antislop-human, antislop-layoutmobile, antislop-ui
- 스니펫은 원문 인용이다. 리포트 금지 문자인 em dash는 해당 위치에 `<U+2014>`로 표기했다.

## Findings

### 1. [HIGH] 유저 대상 에러 메시지에 em dash 사용
- 위치: apps/data-api/src/routes/render.ts:141
- 규칙: R-02 (Hard Gate)
- 사유: 대시보드 인사 카드 미리보기가 그대로 받는 400 응답 본문에 금지 문자가 들어 있다.
- 근거:
```ts
				throw new DataApiError(400, 'greeting_image_missing', '이미지 설정이 비어 있어요 <U+2014> useImage를 켜고 배경을 지정해 주세요.');
```
- 제안: 마침표로 나눠 문장 두 개로 교체한다 (예: `이미지 설정이 비어 있어요. useImage를 켜고 배경을 지정해 주세요.`).

### 2. [MEDIUM] 박스 드로잉 구분선 섹션 헤더 24곳
- 위치: apps/data-api/src/routes/cache-providers.ts:18 (동일 패턴 24곳: guild-data 8 · render 5 · player 5 · ai 1 · ohaasa 1 · cache-providers 4)
- 규칙: antislop-code 체크리스트 (장식 구분선/박스 드로잉 헤더)
- 사유: 라벨 자체는 유효하지만 `──`로 감싼 장식이 "AI가 만든 배너" 신호가 된다.
- 근거:
```ts
	// ── 가사 ──
```
- 제안: `──` 장식만 제거하고 라벨 라인은 그대로 남긴다.

### 3. [MEDIUM] stripCodeFences 함수가 두 파일에 그대로 복제됨
- 위치: apps/data-api/src/routes/customCommandRefine.ts:47 (동일 구현 customCommandDraft.ts:77-83)
- 규칙: ai-slop-cleaner (중복 코드) + antislop-code (JSDoc 시그니처 반복)
- 사유: refine 파일은 draft 파일에서 다른 심볼을 이미 임포트하는데 같은 함수를 한 번 더 복사했다.
- 근거:
```ts
/** ```` 펜스로 감싸 온 출력을 벗겨요 (초안 파서와 같은 처리) */
function stripCodeFences(text: string): string {
	const lines = text.split('\n');
```
- 제안: customCommandDraft.ts에서 내보내고 refine은 임포트해 중복과 시그니처 반복 주석을 없앤다.

### 4. [MEDIUM] 도메인 에러 name 매핑 400 응답 블록 3곳 복제
- 위치: apps/data-api/src/routes/cache-providers.ts:54 (동일 구조 :83 DeliveryError, render.ts:178 GreetingBackgroundError)
- 규칙: ai-slop-cleaner (라우트 간 copy-paste)
- 사유: instanceof 체크, identifier 캐스팅, 400 응답 조립까지 같은 4줄이 세 번 반복된다.
- 근거:
```ts
			if (error instanceof Error && error.name === 'WeatherError') {
				const e = error as { identifier?: string };
				return reply.code(400).send({
```
- 제안: `sendDomainError(reply, error, fallbackCode)` 형태의 공용 헬퍼를 common.ts에 두고 세 곳이 쓰게 한다.

### 5. [MEDIUM] 소셜 구독 라우트의 파라미터 검증 400 블록 4회 복제
- 위치: apps/data-api/src/routes/social.ts:70 (동일 구조 :79, :88, :97)
- 규칙: ai-slop-cleaner (라우트 간 copy-paste, 검증 로직 중복)
- 사유: safeParse 실패 시 400을 내리는 4줄 블록이 네 핸들러에 그대로 반복된다.
- 근거:
```ts
		const parsed = guildIdParams.safeParse(request.params);
		if (!parsed.success) {
			return reply.code(400).send({ error: 'invalid_params', message: '길드 ID 형식이 올바르지 않아요.' });
```
- 제안: `parseParamsOr400(reply, schema, request.params, 문구)` 헬퍼로 줄이고 핸들러는 프록시 위임만 남긴다.

### 6. [MEDIUM] Redis 미연결 503 분기와 주석이 3회 그대로 반복
- 위치: apps/data-api/src/routes/guild-data.ts:64 (동일 구조 :150, :190 / 동일 주석 :63, :149, :189)
- 규칙: ai-slop-cleaner (라우트 간 copy-paste)
- 사유: `getClient()` null 검사, 503 `redis_unavailable` 응답, 주석 한 줄이 세 라우트에 한 글자까지 같다.
- 근거:
```ts
				return reply.code(503).send({ error: 'redis_unavailable', message: '무효화 브로드캐스트를 위해 Redis가 필요해요.' });
```
- 제안: `requireRedisClient(reply, 행위명)` 헬퍼로 합치고 메시지만 인자로 받는다.

### 7. [MEDIUM] 길드 목록 핸들러 3개가 같은 구조 반복
- 위치: apps/data-api/src/routes/guild-data.ts:231 (동일 구조 :243 roles, :261 members)
- 규칙: ai-slop-cleaner (라우트 간 copy-paste, 검증·실패 매핑 중복)
- 사유: 파라미터 파싱, 실패 매핑, 메트릭, 응답 조립 흐름이 채널/역할/멤버 세 곳에서 같다.
- 근거:
```ts
			if (!result.ok) return replyGuildDataFailure(reply, result.reason);
			metrics.request('guild-data-channels');
			return reply.send({ channels: result.channels ?? [] });
```
- 제안: 채널·역할은 `kind`와 응답 키를 받는 팩토리로 합치고, 멤버만 쿼리 검증을 따로 남긴다.

### 8. [LOW] customCommandDraft 모듈 헤더 주석이 11줄로 과설명
- 위치: apps/data-api/src/routes/customCommandDraft.ts:1
- 규칙: antislop-code 체크리스트 (3줄 초과 과설명)
- 사유: 보존할 사실(LLM 불신·재검증·규칙 상수 공유)은 맞지만 3문단 11줄은 분량 자체가 생성 흔적이다.
- 근거:
```ts
 * LLM 출력은 신뢰할 수 없으므로 (코드 펜스·잡담·형식 오류 포함) 항상 파싱+스키마 재검증을
 * 거쳐요. 형식이 맞지 않으면 사유를 담아 1회 재요청하고, 그래도 실패하면 사유를 돌려줘요
 * (HTTP 응답의 한국어 안내는 라우트가 만들어요).
```
- 제안: 사실은 유지하되 목적·재시도·계약 위치 세 줄로 압축한다.

### 9. [LOW] 길드 데이터 흐름 주석이 6줄로 과설명·단계 내레이션
- 위치: apps/data-api/src/routes/guild-data.ts:222
- 규칙: antislop-code 체크리스트 (3줄 초과 과설명, 단계 내레이션)
- 사유: 릴레이 프로토콜 사실은 보존 대상이지만 호출 순서를 한 줄씩 늘어놓은 구성이다.
- 근거:
```ts
	// 대시보드는 사용자 토큰으로 Discord API를 직접 호출하면 401이 나서 봇 권한으로 우회해요.
	// data-api가 request 채널(sirubot:guild-data:request)로 요청을 퍼블리시하면 해당 길드를 보유한
	// 봇 프로세스가 자기 캐시에서 목록을 응답 채널(sirubot:guild-data:response)로 돌려주고,
```
- 제안: 채널명과 503/502 타임아웃 규칙만 남기고 우회 이유 한 줄로 줄인다.

### 10. [LOW] import 별칭 상수가 필요 없는 래퍼
- 위치: apps/data-api/src/routes/ai.ts:17 (동일 :41)
- 규칙: ai-slop-cleaner (불필요 래퍼)
- 사유: 임포트한 스키마를 같은 이름 구조로 한 번 더 대입만 해 읽는 이점이 없다.
- 근거:
```ts
	const draftRequestSchema = customCommandDraftRequestSchema;
```
- 제안: 별칭을 없애고 임포트한 원래 이름을 그대로 쓴다.

### 11. [LOW] social.ts의 guildIdParams가 common.ts 스키마를 중복 정의
- 위치: apps/data-api/src/routes/social.ts:12 (동일 정의 apps/data-api/src/routes/common.ts:59)
- 규칙: ai-slop-cleaner (zod 스키마 중복)
- 사유: `z.object({ guildId: redisIdSchema })`가 공용 모듈에 이미 있는데 같은 스키마를 한 번 더 선언했다.
- 근거:
```ts
const guildIdParams = z.object({ guildId: redisIdSchema });
```
- 제안: common.ts의 `guildIdParams`를 임포트해 쓰고 사본을 지운다.

### 12. [LOW] pending 키 NX 선점 후 409 거절 패턴이 2회 중복
- 위치: apps/data-api/src/routes/guild-data.ts:154 (동일 구조 :195)
- 규칙: ai-slop-cleaner (중복 코드)
- 사유: `set(key, payload, {EX, NX})`와 `null`이면 409 `DataApiError`를 던지는 흐름이 두 라우트에 같다.
- 근거:
```ts
			const acquired = await client.set(
				memberGreetingPendingKey(body.guildId),
				wrapRedisMessage(redisSigningKey, { kind: body.kind, userId: body.userId, requestId }),
```
- 제안: 키·TTL·충돌 메시지를 인자로 받는 `claimPendingSlot()` 헬퍼로 합친다.

### 13. [LOW] 브레이커 없음 상태 문구가 조건보다 강한 주장을 함
- 위치: apps/data-api/src/routes/dashboard.ts:215
- 규칙: copywriting 체크리스트 (근거 없는 보장 문구)
- 사유: 조건은 breaker 목록이 빈 경우(:209-210)뿐인데 "모든 프로바이더 정상"으로 단정해 말한다.
- 근거:
```ts
		: '<div class="empty">열린 브레이커 없음: 모든 프로바이더 정상</div>';
```
- 제안: 확인한 사실만 적어 `열린 브레이커 없음`으로 끝낸다.

### 14. [LOW] 대시보드 빈 상태 문구의 장식 이모지
- 위치: apps/data-api/src/routes/dashboard.ts:193
- 규칙: antislop-ui 체크리스트 R-04 (장식 이모지)
- 사유: 오류 없음이라는 상태는 문장으로 이미 전달되며 이모지는 정보를 더하지 않는다.
- 근거:
```ts
		: '<div class="empty">재생 오류가 없어요 🎉</div>';
```
- 제안: 이모지를 빼고 `재생 오류가 없어요`만 남긴다.

### 15. [LOW] 범위 내 소스 13개 파일에 테스트가 없음
- 위치: apps/data-api/src/routes/common.ts:14
- 규칙: ai-slop-cleaner (테스트 누락, LOW)
- 사유: 전 라우트가 쓰는 공통 오류 매핑(sendError·replyBotRelayFailure)과 소셜 프록시·길드 릴레이 매핑에 테스트 파일이 없다.
- 근거:
```ts
export function sendError(reply: { code: (n: number) => any }, error: unknown): any {
```
- 제안: 공통 오류 매핑(상태코드별 분기)과 social 프록시 실패(503/502) 경로부터 단위 테스트를 붙인다.

## 검사했지만 문제 없는 항목

- 죽은 코드·미사용 export: 범위 내 export 20여 개와 import를 전수 확인했고, 도달하지 않는 export나 쓰이지 않는 import는 없다.
- 잘못된 레이어 import: 범위 내 import는 fastify/zod, `@sirubot/utils`, `@sirubot/app-kit`, 같은 앱의 utils/providers/services뿐이다. routes/common.ts가 serveCached.ts에서 DataApiError를 가져오는 것은 같은 routes 디렉터리 내부 참조다.
- 모호 TODO/FIXME/HACK: 범위 내 0건.
- 코드 주석의 장식 이모지, end marker, 빈 라벨, 라인별 내레이션: 0건. player.ts:112의 `// noop`은 빈 catch의 의도 표명으로 판단해 유지 대상이다.
- R-16 버즈워드, R-15 범용 CTA, 챗봇 클로저: 유저 응답 메시지 20여 개를 전수 확인해 0건. `잠시 후 다시 시도해 주세요`류는 행동 안내라 클로저로 보지 않는다.
- R-17/R-38 숫자: 메시지 속 수치(`1~200자`, `1~60 정수`, TTL 120초 등)는 같은 파일의 zod 스키마·상수와 일치해 근거 있는 값이다.
- R-02 그 외: 대시보드 HTML 문자열, zod 안내 문구, DataApiError 메시지 전수 검색에서 em dash는 findings 1의 1건뿐이고, en dash와 이중 하이픈 연결자는 0건이다.
- R-25 명암: 대시보드 본문 색 `#8b93a3`은 배경 `#0f1116` 대비 6.11:1, 표면 `#161a22` 대비 5.64:1로 스킬의 contrast-check.py 계산에서 AA 통과.
- R-32 키보드: 대시보드 HTML에 `outline` 제거 규칙이 없고(기본 포커스 링 유지), 인증 입력창에 Enter 키 처리가 있어 키보드로 조작 가능하다.
- R-21 다크 고정: 내부 관제 페이지라 R-21의 개발자 도구 예외에 해당한다고 봤다.
- try/catch + sendError 보일러플레이트와 ai.ts 초안/수정 핸들러의 유사성: Fastify 핸들러 관례이고, 응답 키·에러 코드·메트릭이 달라 공용 래퍼는 과추상화가 된다.

## 검사하지 못한 항목 (실행·범위 제약)

- R-03/R-35 런타임 확인: 빌드·실행 금지 조건이라 대시보드 HTML의 7열 테이블이 좁은 폭에서 가로 스크롤을 만드는지는 정적 검토로 확정하지 못했다.
- zod 안내 문구 원문: `redisIdSchema` 등은 `packages/utils`(범위 밖)에 있어 400 응답으로 나가는 스키마 메시지의 실제 문구는 확인하지 못했다.
- breaker 스냅샷 의미론: `utils/breaker.ts`(범위 밖)를 읽지 못해 findings 13의 판단은 범위 내 조건부 코드에서만 근거를 뒀다.
