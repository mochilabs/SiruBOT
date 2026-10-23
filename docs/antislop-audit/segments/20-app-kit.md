TOTAL: 5 (HIGH:0 MEDIUM:1 LOW:4)

# packages/app-kit 감사 세그먼트

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 11개 (src 9개: auth/env/errors/logger + 테스트 4개, package.json, tsconfig.json)
- 비교용 참조: packages/utils/src/logger.ts (로거 설정 미러 검증 목적, 1개 파일)
- 감사 기준: 주석 슬롭(antislop-code), AI 코드 슬롭(ai-slop-cleaner), 클라이언트 대상 메시지(copy)

## Findings

### 1. [MEDIUM] 로거 설정 이중 정의: packages/utils 로거 설정의 수동 미러

- 위치: `packages/app-kit/src/logger.ts:3`, `packages/app-kit/src/logger.ts:4-12`, `packages/app-kit/src/logger.ts:15-22` (원본: `packages/utils/src/logger.ts:3-11`, `packages/utils/src/logger.ts:13-20`)
- 규칙: ai-slop-cleaner 중복 로직 (이중 정의)
- 사유: LOG_LEVEL_MAP, resolveMinLevel이 두 파일에 사실상 동일하게 복제돼 있고, 한쪽 변경을 다른 쪽에 강제하는 장치가 없다. 주석과 테스트는 각각 "미러예요, 한쪽을 바꾸면 함께 바꿔요"라고만 선언한다.
- 근거:

```ts
// app-kit logger.ts:15 / utils logger.ts:13 (동일 로직)
export function resolveMinLevel(): number {   // utils 쪽은 export 없이 동일 본문
	if (typeof process === 'undefined' || !process.env) return 3;
```

```ts
// logger.test.ts:4
// resolveMinLevel은 packages/utils/src/logger.ts(getLoggerSettings)의 미러예요 ... (발췌)
```

- 제안: 두 앱이 실제로 쓰는 LOGLEVEL 해석부만 `@sirubot/utils` 서브패스로 공용 추출하거나, 최소한 utils의 새 레벨 추가/change를 감사해 드리프트를 검출하는 동기화 테스트를 한쪽에 둔다. (현재 app-kit은 utils를 의존하지 않는 의도적 분리라는 점은 주석·AGENTS.md에 명시돼 있어 의도 자체는 확인됨)

### 2. [LOW] 인증 검사 분기와 401 메시지가 파일 안에서 두 세트로 반복

- 위치: `packages/app-kit/src/auth.ts:45-50` (createKeyAuthHook의 onRequest) vs `packages/app-kit/src/auth.ts:71-76` (createKeyPreHandler)
- 규칙: ai-slop-cleaner 중복 로직 (경미)
- 사유: "헤더 없음 → 401 '인증 정보가 없어요.', 키 불일치 → 401 '인증에 실패했어요.'" 분기가 동일 문자열과 함께 두 곳에 구현돼 있다. 문자열 일치가 우연히 유지되길 바라는 구조다.
- 근거:

```ts
if (typeof provided !== 'string') return reply.code(401).send({ error: '인증 정보가 없어요.' });
if (!timingSafeKeyEqual(provided, key)) {
	return reply.code(401).send({ error: '인증에 실패했어요.' });
```

- 제안: `verifyAuthHeader(header, key): 'ok' | 'missing' | 'invalid'` 식의 공용 검사 함수를 두고 두 API가 공유하게 해 메시지·분기 일치를 코드로 강제한다.

### 3. [LOW] auth.ts:33 주석이 위쪽 JSDoc을 그대로 재서술

- 위치: `packages/app-kit/src/auth.ts:33` (재서술 대상: `packages/app-kit/src/auth.ts:16`)
- 규칙: antislop-code Restating the Obvious
- 사유: "키가 없으면 auth 비활성화 대신 fail-closed" 문장이 KeyAuthHookOptions.key 필드 JSDoc에 이미 있고, 바로 아래 `if (!key)` throw 코드가 같은 사실을 보여준다. 같은 줄 아래 34행의 "throw는 main().catch로 이어진다"는 새 사실이라 남겨도 된다.
- 근거:

```ts
if (!key) {
	logger.error('AUTH_KEY is not set - refusing to start (fail-closed)');
	throw new Error('AUTH_KEY is not set - refusing to start (fail-closed)');
```

- 제안: 33행 삭제, 34행(라이브러리 미종료, 진입점 exit 위임)만 유지한다.

### 4. [LOW] auth.ts:73 주석이 호출부 코드와 상단 JSDoc을 반복

- 위치: `packages/app-kit/src/auth.ts:73` (호출부: `packages/app-kit/src/auth.ts:74`, 상단 JSDoc: `packages/app-kit/src/auth.ts:5-8`)
- 규칙: antislop-code Signature Echo / Restating the Obvious
- 사유: 주석이 "sha256 다이제스트 기반 타이밍 안전 비교로 통일해요 (timingSafeKeyEqual)"라고 말하지만, 바로 아래 호출 함수명이 timingSafeKeyEqual이고 같은 근거(타이밍 공격 방지, 다이제스트 고정)가 5-8행 JSDoc에 이미 있다.
- 근거:

```ts
// 문자열 직접 비교 대신 sha256 다이제스트 기반 타이밍 안전 비교로 통일해요 (timingSafeKeyEqual).
if (!timingSafeKeyEqual(provided, key)) {
```

- 제안: 73행 삭제한다. 보안 근거 자체는 파일 상단 JSDoc에 남아 있어 정보 손실이 없다.

### 5. [LOW] "라이브러리는 프로세스를 종료하지 않아요" 설계 설명이 두 파일에 유사 문장으로 반복

- 위치: `packages/app-kit/src/env.ts:5-6` 와 `packages/app-kit/src/auth.ts:34`
- 규칙: antislop-code 재서술 (같은 설계 결정의 이중 설명)
- 사유: "라이브러리는 프로세스를 종료하지 않아요: throw는 각 앱 진입점의 main().catch → exit(1)로 이어진다"라는 동일 설명이 parseEnvOrExit과 createKeyAuthHook 양쪽에 적혀 있다. 각 주석은 사실이고 보존할 가치도 있지만, 한쪽이 다른 쪽을 참조하는 편이 낫다.
- 근거:

```ts
// env.ts:5 (발췌) 라이브러리는 프로세스를 종료하지 않아요: 이 함수는 각 앱의 진입점 main() 탑레벨에서...
// auth.ts:34 (발췌) 라이브러리는 프로세스를 종료하지 않아요: throw는 각 앱 진입점의 main().catch → process.exit(1)로 이어져요.
```

- 제안: 설계 근거를 한 곳(공용 문서 또는 한쪽 주석)에만 쓰고 다른 쪽은 한 줄 참조로 줄인다.

## 검사했지만 문제 없는 항목

- **클라이언트 대상 메시지 (R-02, R-16, R-17/R-36/R-38)**: `errors.ts:21-29`, `errors.ts:17`, `errors.ts:51`, `auth.ts:46`, `auth.ts:49`, `auth.ts:72`, `auth.ts:75`의 HTTP 응답 문구 전부에 em dash, 마케팅 버즈워드, 근거 없는 숫자·보장, 챗봇 클로저가 없다. 한국어 "~어요"체로 일관되고 인증 실패 시 내부 사유를 노출하지 않는다 (내부 정보 유출 방지 근거는 `errors.ts:50` 주석으로 보존 가치 있음).
- **주석 슬롭 패턴 전체 스캔**: 구분선(====), 장식 이모지, end marker, 빈 라벨, 모호 TODO, 단계 내레이션, 라인별 내레이션, 딱딱/외침 문체 전부 미발견. 문서화된 JSDoc 대부분이 보안 근거(`auth.ts:5-8`), SEC-010 프로토콜 근거(`auth.ts:20`), Fastify register() 캡슐화 함정(`auth.ts:27`), data-api 메시지 동기화 계약(`auth.ts:44`, `errors.ts:16`, `errors.ts:32`), statusText 한국어 대체 근거(`errors.ts:19`)처럼 실제 정보를 담아 보존 대상으로 판단했다.
- **죽은 코드/미사용 export**: 패키지 내부에서 미사용으로 남는 export 정황 없음. index.ts 배럴이 4개 모듈을 모두 재노출하고 각 모듈의 export는 테스트 또는 toHttpErrorResponse 등 내부 사용이 확인된다. 단, data-api 등 앱들이 실제로 모두 쓰는지는 이 감사 범위 밖이라 미검증이다.
- **잘못된 레이어 import**: app-kit은 fastify, tslog, zod, node:crypto만 의존하고 앱/다른 패키지를 import하지 않는다 (findings 1의 미러가 바로 이 분리의 결과다).
- **테스트 누락**: 테스트 4개 파일이 실재한다 (auth.test.ts 111줄, errors.test.ts 88줄, logger.test.ts 44줄, env.test.ts 33줄). "테스트 0개"가 아니라 인증 fail-closed, 쿼리스트링 포함 정확 경로 일치(SEC-010 회귀), 500 본문 정보 유출 방지까지 계약을 고정하고 있다.
- **package.json / tsconfig.json**: 주석·설명 없이 최소 구성이다. 의존성과 exports, scripts에 슬롭 정황 없다.

## 참고 (finding 아님)

- 내부 주석의 한국어 구분자(U+2014 문자)는 저장소 전체 문체인데, 이 감사 지시의 R-02 점검 대상은 클라이언트 대상 메시지라 finding으로 세지 않았다. HTTP 응답 문자열에는 등장하지 않는다.
- `package.json:16`의 `--passWithNoTests`는 테스트가 존재하는 현재 상태에서 무해한 플래그다.
