TOTAL: 8 (HIGH:0 MEDIUM:1 LOW:7)

# 13. 범위: apps/storage/src (antislop 코드베이스 감사)

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 15개 (src/** 전체, 테스트 7개 포함)
- 방법: 파일 전수 독해 + 패턴 검색(em dash, TODO/FIXME, 구분선/상자문자, 장식 이모지, 버즈워드, 챗봇 클로저, 중복 문자열/캐치 블록)
- 스니펫 표기: `[EM DASH]`는 원문의 U+2014 문자 자리, `[이모지]`는 원문의 장식 이모지 자리를 뜻한다. 리포트 본문에는 이 문자들을 쓰지 않는다.

---

### 1. [MEDIUM] ObjectPathError 400 매핑 캐치 블록 4회 중복

- 위치: apps/storage/src/routes/objects.ts:48 (동일 패턴 :68, :94, :111)
- 규칙: ai-slop-cleaner 체크리스트 (중복 로직)
- 사유: 동일한 3줄 캐치 블록이 4개 핸들러에 그대로 반복돼, 문구나 매핑을 바꿀 때 4곳을 동시에 수정해야 한다.
- 근거:

```ts
} catch (error) {
	if (error instanceof ObjectPathError) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
	throw error;
```

- 제안: server.ts:17이 명시한 "라우트 층에서 ObjectPathError를 400으로 매핑" 계약은 유지하되, objects.ts 파일 안에서 store 호출을 감싸는 공용 헬퍼로 캐치와 응답을 한곳으로 모으기.

### 2. [LOW] 내부 주석 15곳의 em dash 사용

- 위치: apps/storage/src/index.ts:8 (외 14곳: auth.ts:5-6, server.ts:16, health.ts:3, server.test.ts:8, objects.ts:16/21/62/80/105, objectStore.ts:23/29, env.ts:9/21)
- 규칙: R-02
- 사유: 사용자 대상 JSON 응답 문자열에는 한 곳도 없고 내부 주석에만 반복돼 있어 LOW로 기록한다.
- 근거:

```ts
// data-api·notifier와 같은 패턴 [EM DASH] SENTRY_DSN이 없으면 no-op이에요.
initSentry({ service: 'storage' });
```

- 제안: 신규 주석에서는 쉼표·괄호·새 문장으로 대체하거나, 지휘자가 이 문자를 프로젝트 문관례로 확정했다는 기록을 남기기.

### 3. [LOW] 기동 오류 메시지의 장식 이모지

- 위치: apps/storage/src/config/env.ts:23
- 규칙: antislop-code 체크리스트 (장식 이모지), R-36 계열. 기동 시 콘솔 출력(내부 로그성)이라 LOW.
- 사유: 메시지 앞의 장식 이모지는 심각도 외 정보를 더하지 않고, 오류 수준은 이미 console.error이 표현한다.
- 근거:

```ts
console.error('[이모지] STORAGE_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
process.exit(1);
```

- 제안: 이모지를 빼고 메시지 본문만 남기기.

### 4. [LOW] 라우트 선언부를 그대로 반복하는 섹션 라벨 주석

- 위치: apps/storage/src/routes/objects.ts:105 (동일 형식 :21, :80)
- 규칙: antislop-code (재서술, Restating the Obvious)
- 사유: 주석의 메서드·경로·보호 라우트 정보가 바로 아래 선언의 fastify.delete, 경로 문자열, preHandler: guard에 이미 모두 있다.
- 근거:

```ts
// 삭제 (DELETE /:bucket/*key) [EM DASH] 보호 라우트
fastify.delete<{ Params: { bucket: string; '*': string } }>('/:bucket/*', { preHandler: guard }, async (request, reply) => {
```

- 제안: 인증 상태 요약만 남기거나 제거하기. :62처럼 공개 조회 출처(디스코드 프록시)처럼 코드에 없는 정보를 주는 주석은 유지.

### 5. [LOW] 동일 오류 문자열이 소스 8곳에 하드코딩

- 위치: apps/storage/src/services/objectStore.ts:35 (같은 문자열 :38, :45 / objects.ts:48, :68, :86, :94, :111)
- 규칙: ai-slop-cleaner (중복)
- 사유: 서버의 400 응답과 ObjectPathError 메시지가 각각 갱신되면 문구가 어긋날 수 있고, server.test.ts:45가 이 문자열을 그대로 비교해 두어 drift 위험이 있다.
- 근거:

```ts
if (!SAFE_SEGMENT.test(segment) || segment.includes('..')) throw new ObjectPathError('경로가 올바르지 않아요.');
// ...
if (error instanceof ObjectPathError) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
```

- 제안: 한 상수로 모으기 (경미한 문자열 중복이라 LOW).

### 6. [LOW] config/env.ts fail-closed 분기 미테스트

- 위치: apps/storage/src/config/env.ts:22
- 규칙: ai-slop-cleaner (테스트 누락, LOW)
- 사유: 키 미설정 시 process.exit(1)로 기동을 거부하는 보안 분기에 대한 테스트 파일이 없다. plugins/auth.test.ts는 requireAuth 레이러만 커버한다.
- 근거:

```ts
// 키가 없으면 fail-closed [EM DASH] 인증 없는 스토리지로 기동하지 않아요.
if (!env.storageAuthKey) {
```

- 제안: validateEnv의 fail-closed 경로를 검증하는 env 테스트 추가.

### 7. [LOW] x-request-id 응답 헤더 미테스트

- 위치: apps/storage/src/server.ts:14
- 규칙: ai-slop-cleaner (테스트 누락, LOW)
- 사유: onSend 훅이 모든 응답에 헤더를 싣지만 범위 내 어떤 테스트도 이 헤더를 검증하지 않는다.
- 근거:

```ts
fastify.addHook('onSend', async (request, reply) => {
	reply.header('x-request-id', request.id);
});
```

- 제안: server.test.ts에 헤더 존재 여부 검증 한 줄 추가.

### 8. [LOW] PUT 핸들러 방어 분기 2곳의 도달성 미검증 (죽은 코드 의심)

- 위치: apps/storage/src/routes/objects.ts:32 (같은 의심 :34)
- 규칙: ai-slop-cleaner (죽은 코드)
- 사유: '*' 콘텐츠 파서가 parseAs: 'buffer'라 비버퍼 분기(L32)가 어렵고, 413 검사(L34)는 bodyLimit과 같은 ASSET_MAX_BYTES(L24)를 비교해 파싱 단계의 413에 가려질 수 있다. 두 분기의 메시지는 어떤 테스트도 검증하지 않으며, 범위 안에서 도달성을 확증하지 못했다.
- 근거:

```ts
if (!Buffer.isBuffer(body)) return reply.code(400).send({ error: '파일 본문이 필요해요.' });
const bytes = new Uint8Array(body);
if (bytes.length > ASSET_MAX_BYTES) return reply.code(413).send({ error: '이미지가 너무 커요. 최대 8MB까지 올릴 수 있어요.' });
```

- 제안: 응답 본문까지 확인하는 테스트로 실제 경로를 확정한 뒤, 도달 불가로 확인되면 분기 제거 또는 파싱 단계와의 한계값 분리 중 하나 선택.

---

## 검사했지만 문제 없는 항목

1. R-02 (사용자 대상 응답): objects.ts의 오류 문자열 8종('빈 파일은 올릴 수 없어요.' 등)에 em dash 없음. em dash 15곳은 전부 주석(파일별 위치는 finding 2).
2. R-16 버즈워드: seamless, revolutionary, cutting edge, 혁신, 차세대, 탁월, 압도적, 완벽한 등의 키워드 검색 결과 0건.
3. R-17/R-36/R-38 숫자·보장: '최대 8MB'는 ASSET_MAX_BYTES 상수에서 나오는 값이고 objects.put.test.ts:77의 9MB 테스트로 상한 동작이 확인된다. 단 상수 원문 값은 감사 범위 밖이라 직접 대조하지는 못했다. max-age=31536000과 max-keys=1000은 프로토콜·설정값이다.
4. 챗봇 클로저: '도와드릴', '궁금', 'Let me know' 등 검색 결과 0건. 응답 문체는 "~해요"로 일관된다.
5. 주석 슬롭 체크리스트: 구분선(=, -, 상자문자), 단계 내레이션, 빈 라벨, 모호 TODO/FIXME, end marker, 장식 이모지 주석 0건(TODO 계열 grep 0건, 구분선 grep 0건). 3줄을 넘는 과설명 주석도 없으며 최대 2줄이다.
6. JSDoc 시그니처 에코 없음: plugins/auth.ts:4-6은 Bearer 스킴 부재와 적용 범위, objectStore.ts:23은 업로드 시 매직 바이트 검증과의 관계를 더하므로 보존 대상으로 판단했다.
7. 죽은 export·미사용 import: 15개 파일 전수 확인. getLogger, contentTypeForKey, StoredObject, ObjectPathError, requireAuth 등 모든 export에 사용처가 있다.
8. 잘못된 레이어 import: 서버 앱인 storage의 @sirubot/utils 루트 배럴 사용(ASSET_ALLOWED_MIME_TYPES 등)은 AGENTS.md의 서버 앱 전용 규칙 안에 있다. 대시보드 임포트 금지는 클라이언트 번들에만 적용된다.
9. 테스트 골격 반복: objects.get/list-delete/put 테스트의 mkdtemp + Fastify setup 반복은 파일 독립성을 위한 표준 부트스트랩으로 의도적 반복으로 제외했다. '이중 인코딩(%252e)' 주석 3회 반복도 각 파일에서 읽히는 실정보라 제외했다.
10. UI 규칙(R-03, R-25, R-26, R-27, R-32, R-34): storage 앱에 UI가 없어 해당 없음. R-35(실행 검증)는 이번 세그먼트가 read-only 감사라 해당 없으며, 빌드·테스트는 지시상 실행하지 않았다.
