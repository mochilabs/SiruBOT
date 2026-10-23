# 성능 감사 보고서 (Performance Audit)

> 작성일: 2026-10-21 · 대상 브랜치: `beta`
> 본 문서는 **정적 코드 분석** 결과다. 실행 프로파일링·벤치마크는 수행하지 않았으며, 모든 비용 모델은 코드 구조 기반 추정이다. 항목별 "검증 방법" 절차로 실측 확인 후 적용할 것.
> 1차 일반 감사(보안·의존성·정확성) 결과는 부록에 요약했다.

---

## Fatal #1 — `estimateTokens`: 숫자 하나 세겠다고 배열을 통째로 할당

**근거: `apps/bot/src/services/aiChatService.ts:23-32`**

```ts
const DENSE_CHARS_RE = /[가-힯...]/g;
const dense = text.match(DENSE_CHARS_RE)?.length ?? 0;
```

**문제**

- `String.prototype.match()` with `/g`는 매칭된 **모든 문자를 요소로 하는 배열을 새로 할당**해 반환한다. 4,000자 한국어 텍스트면 heap에 4,000개짜리 single-char string 배열이 깔린다. 카운트 하나 얻자고 GC pressure가 텍스트 길이에 정비례한다.
- 호출 컨텍스트가 더 나쁘다. `trimHistoryState`(`:296-314`)가 **매 메시지 append마다** 전체 히스토리를 `reduce`로 돌며 각 메시지에 `historyLine(m)`(문자열 신규 할당) + `estimateTokens`(배열 신규 할당)를 실행 → append당 O(H·문자열길이), 채널 수명 전체로 **O(H²)**, 상수도 크다.

**수정안**

```ts
export function estimateTokens(text: string): number {
	let dense = 0;
	// allocation 없는 단일 패스 — JIT가 charCodeAt을 inline, 배열·정규식·매치 객체 0
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0x3130 && c <= 0x318f) || (c >= 0xff00 && c <= 0xffef)) dense++;
	}
	return Math.ceil(dense * 0.7 + (text.length - dense) * 0.28);
}
```

추가로 `ChannelHistoryState`에 `tokens: number` 누적 필드를 두고 push/shift 시 **증분 갱신**, `historyLine` 결과는 캐시. append당 O(1)로 떨어진다.

**검증 방법**

- `yarn workspace @sirubot/bot test`에 `estimateTokens` 단위 테스트 추가(한/영/혼합/빈 문자열).
- 150턴 히스토리로 append 루프 마이크로벤치: 수정 전후 `process.hrtime` + `--expose-gc` 기준 할당량 비교.

---

## Fatal #2 — `JSON.parse(JSON.stringify(...))`: 직렬화 왕복을 클론으로 사용

**근거: `aiChatService.ts:265-281`**

```ts
const payload = JSON.parse(JSON.stringify({ messages: state.messages, summary: state.summary, pending: state.pending }));
```

**문제**

- deep clone 의도였다면 `structuredClone`이 있다(더 빠르고 네이티브 경로). 진짜 범죄는 이 뒤다.
- 이 함수는 **유저 메시지 1건마다**(edit·delete·push 모두) 호출되며, 히스토리 **전체**(최대 150턴 + pending 120개)를 stringify walk → string 할당 → parse walk → 객체 재할당.
- 이어서 `upsert`로 **행 전체 JSONB를 통째로 재기록**. 채팅 한 줄 = 히스토리 전체 직렬화 ×2 + DB 전체 행 쓰기. **write amplification의 정석.**

**수정안**

1. 클론 제거 — plain object 그대로 전달(Prisma JSON 컬럼은 plain object를 받는다).
2. persist를 per-channel debounce(500ms~1s)로 coalesce + dirty flag로 불필요한 upsert 제거.
3. (근본 처치) JSONB 일기장 대신 turn 단위 row 분리.

**검증 방법**

- 채팅 20건 연속 전송 시 DB `UPDATE` 횟수·payload 크기를 Prisma query log로 계측, 수정 전후 비교.

---

## Fatal #3 — 읽기 경로에 존재하지 않는 "캐시"

**근거: `apps/bot/src/modules/audio/lavalink/pendingWriteStore.ts:49-72`, `queueStore.ts:31-35`**

- `getRaw`는 Redis가 살아 있으면 **항상** `redis.get`을 친다(`:52-58`). 캐시 히트는 Redis 다운/miss 시뿐(`:66-70`). 즉 `MemoryCache`가 메모리는 차지하면서 **served latency 0%, 절감 RTT 0개** — 재난 대비용 백업을 hot-path 앞에 세워둔 셈. 이름은 `CachedQueueStore`인데 하는 일은 Redis 프록시 + 백업.
- 쓰기는 더 심하다. `queueStore.set`은 큐 변경 이벤트마다 **큐 전체를 `JSON.stringify`** 해 `await redis.set` 직행. lavalink-client는 trackStart/trackEnd/enqueue/편집마다 set을 호출하니 트랙 N개 큐에서 세션 전체 직렬화 비용이 **O(N²)** 로 누적. 트랙 `encoded` 문자열 + 메타데이터가 든 블롭이 이벤트마다 네트워크를 탄다.
- `PendingWriteStore` 저널은 정전 대비일 뿐 **배칭이 아니다.**

**수정안**

- read: cache-first(TTL 신뢰 — 이미 30분 TTL 준비됨, `queueStore.ts:7-10`).
- write: write-behind + 300~500ms coalesce(`playerNotifier`가 이미 증명한 debounce 패턴, `playerNotifier.ts:33, 160-165`), flush는 기존 `pendingWrites` tombstone 메커니즘 재사용.
- 크래시 복구 정합성이 걱정되면 write-behind 윈도우 동안만 큐를 인메모리 authoritative로 간주 — 지금도 Redis 단절 시 그렇게 동작하고 있다.

**검증 방법**

- Redis `MONITOR`로 트랙 재생 1곡 동안 `SET` 호출 횟수·크기 측정, coalesce 적용 후 비교.
- `getQueue` 반복 호출 시 Redis 명령 카운터(`INFO commandstats`) 증가분 비교.

---

## Fatal #4 — `MemoryCache.evictOldest`: 삽입할 때마다 전체 순회

**근거: `packages/utils/src/memoryCache.ts:20-23, 71-92`**

```ts
if (!this.cache.has(key) && this.cache.size >= maxSize) { this.evictOldest(); }
// evictOldest: Map 전체를 순회하며 Date.now()를 반복 호출, '가장 오래된' 하나만 지움
```

**문제**

- 포화 상태에서 insert 1건 = O(n) 전수조사. 하나만 지우므로 포화가 지속되면 **매 insert가 O(n)**, 버스트당 O(n²).
- 이게 `customCommandPrefix.ts:38` 쿨다운 캐시(maxSize 5,000)로 **모든 메시지 이벤트의 hot path**에 있다. 5,001명의 유저가 접두사 메시지를 연타하면 메시지당 5,000-entry 스캔 반복. 디도스 방어 장치가 디도스 증폭기.
- `get()`에서 `lastUpdated = Date.now()` 갱신(`:43`)을 하니 의도는 LRU — 그럼 LRU답게 만들 것.

**수정안 (O(1) 근사 LRU — JS Map은 insertion-ordered)**

```ts
get(key) {
	const entry = this.cache.get(key);
	if (!entry || entry.expiresAt < Date.now()) { this.cache.delete(key); return undefined; }
	this.cache.delete(key); this.cache.set(key, entry); // reinsert → O(1) LRU 승격
	return entry.data;
}
set(key, value) {
	if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
		this.cache.delete(this.cache.keys().next().value); // 가장 오래된 = 첫 엔트리, O(1)
	}
	this.cache.set(key, { data: value, expiresAt: Date.now() + this.ttl });
}
```

스캔도, 엔트리당 8바이트 낭비인 `lastUpdated` 필드도 필요 없다.

**검증 방법**

- `@sirubot/utils` 테스트에 포화 상태 10,000회 set/get 벤치 추가(수정 전후 wall time 비교).

---

## Fatal #5 — `extractThinkTokens`: 루프 안에서 `toLowerCase()`

**근거: `aiChatService.ts:750, 761`**

```ts
const open = raw.toLowerCase().indexOf(REASON_OPEN, index);   // ← 매 이터레이션
const close = raw.toLowerCase().indexOf(REASON_CLOSE, index); // ← 전체 문자열 소문자 복사
```

- while 루프 **한 바퀴마다 원본 문자열 전체의 소문자 사본을 heap에 신규 할당**. think 태그가 3개면 풀사이즈 문자열 사본 6개.
- 그리고 `REASON_OPEN === REASON_CLOSE === '</think>'`(`:83-84`)라 이 고비용 루프의 **산출물은 정체 불명** — 비용만 지불한다. (정확성 차원의 처방은 1차 감사 부록 참조.)

**수정안**

- 소문자화는 루프 밖 1회(또는 case-insensitive 수동 스캔), 상수 버그(`REASON_OPEN`을 `'<think>'`로) 수정, 테스트 추가.

---

## 그 외 constant-factor 낭비

| 위치 | 문제 | 처치 |
|---|---|---|
| `countingChannel.ts:34-36` + `countingState.ts:41-45` | 숫자 메시지 1건마다 awaited Redis HSET(3필드) — 메모리가 authoritative(`:2, 12` 주석 자인)면서 hot path RTT 대기. **더 큰 문제: async interleaving race** — `await loadCountingState`와 평가·저장 사이의 await gap에서 같은 guild의 두 메시지가 동일 `state`를 읽어 같은 숫자가 두 번 통과됨. 단일 스레드 이벤트 루프라 데이터 레이스는 없지만 await 경계를 낀 check-then-act는 여전히 레이스다. | guildId당 promise-chain 직렬화(`locks.set(gid, prev.then(step))`) + write-behind |
| `trimHistoryState:306` | `state.messages.shift()` — 루프 안 O(n) memmove | head index 커서 방식, 마지막에 `splice` 1회 |
| `getContextTokenBudget():36-39` | 매 push마다 `process.env` 문자열 파싱 | 부팅 시 1회 캐시 |
| `historyLine:289` | `filter(Boolean).join(' ')` — 중간 배열 2개 | 조건 분기 한 줄로 중간 할당 0 |
| `persistChannelHistory:268, 272-278` | 클론은 동기, upsert는 fire-and-forget — 비용은 동기로 내고 저장은 비동기. 최악의 조합 | Fatal #2와 통합 처리 |

---

## 정상 판정 (수정 불필요) — 팩트 체크 차원에서 기록

- **`playerNotifier.ts`** (`:33, 160-165, 274-289`): debounce 300ms + progress tick 5s + **signature 비교로 no-op**(주석 명시) + `timer.unref()`(tick이 프로세스 종료를 막지 않음). 기계와 타협한 흔적이 있다.
- **`PendingWriteStore`** (`pendingWriteStore.ts:12-16, 96-118`): tombstone·sync-then-flip 주석이 재연결 TOCTOU를 정확히 이해하고 있다.
- **카운팅 채널**: 성공 시 조용히 넘기는 불필요 전송 억제(`countingChannel.ts:39-44`) — Discord REST 페이로드를 이벤트당 0~1회로 묶은 판단.

---

## 우선순위 (latency/throughput 임팩트 순)

| # | 대상 | 비용 모델 | 난이도 |
|---|---|---|---|
| 1 | `estimateTokens` match 배열 + trim 누적화 | 채팅 O(H²)×[문자열+배열 할당] → O(1)/append | 하 |
| 2 | `persistChannelHistory` 클론 제거 + persist debounce | 메시지당 전체 히스토리 직렬화×2 + 전행 DB 재기록 | 하 |
| 3 | queueStore cache-first read + write-behind | 큐 이벤트당 풀 직렬화 + Redis RTT → 상시 O(1) | 중 |
| 4 | `MemoryCache` O(1) LRU | 포화 시 insert O(n)→O(1), cooldown 어뷰징 차단 | 하 |
| 5 | counting 레이스(직렬화 락) + write-behind | 정합성 버그 + 메시지당 RTT | 하 |
| 6 | `extractThinkTokens` 소문자화 루프 이탈(상수 버그와 세트) | 스트림 1건당 문자열 전체 복사 ×2×루프 | 하 |

---

## 부록 — 1차 일반 감사(보안·의존성·정확성) 주요 결과

정적 리뷰 기반. 실행 검증이 필요한 항목은 별도 표기.

1. **`aiChatService.ts:83-84`** — `REASON_OPEN`/`REASON_CLOSE` 둘 다 `'</think>'` → `extractThinkTokens`(`:745-766`)가 `<think>` 블록을 제거하지 못함. 테스트 부재. 1,108라인 god service + 모듈 레벨 mutable Map(`:172-176`).
2. **`apps/bot/package.json:16`** — `start` 스크립트의 `--experimental-specifier-resolution=node`는 Node v22/v26 문서에 없는 플래그(`engines: node>=22`, Dockerfile `:163`이 `yarn start` 실행) → 데드 플래그 또는 크래시 위험. **실행 미검증.**
3. **`apps/bot/package.json:7`** — `"types": "dist/index.d.js"` 확장자 오기(data-api는 `.d.ts`).
4. **루트 `package.json:10`** — schema는 PostgreSQL인데 mysql2 resolution 잔존(`docs/architecture.md:386`이 스스로 레거시 잔재라 기술).
5. **루트 `package.json:42-44`** — optionalDependency `@swc/core-android-arm64@1.3.11` vs devDep `@swc/core ^1.13.5` 버전 불일치.
6. **`apps/dashboard/package.json`** — `:27` next-auth `5.0.0-beta.32`; `:53` `@next/swc-wasm-nodejs@16.3.8` vs next `16.4.0` 불일치; `:17` `@redis/client ^6.3.0` vs bot/data-api `^5.8.2` 메이저 괴리.
7. **eval 커맨드** — `evalModal.ts:33` `eslint-disable no-eval`; OwnerOnly + OWNERS env(`:8, 20`); 토큰 redaction 없음.
8. **`scripts/register-commands.ts:133-143`** — `@ts-ignore` + `as any` + `catch(any)` + 잔여 `console.log(json)`.
9. **`.gitignore`** — `core.*`(`:1, :51`), `dist/`(`:17, :41`) 중복.
10. **`bootstrap.ts:36`** — authKey `?? ''`(fail-open) vs data-api/storage의 fail-closed(`data-api/plugins/auth.ts`는 sha256+timingSafeEqual) 정책 불일치.
11. **AGENTS.md 드리프트** — apps 4개 기술 vs 실제 6개(notifier, storage 추가); "모든 워크스페이스 테스트가 루트 vitest config 사용" 주장 vs `apps/dashboard/package.json:11`에 해당 플래그 부재.

**양호 판정**: data-api 인증(sha256+timingSafeEqual), customCommands `interpreter.ts:36-37, 95-97`(allowedMentions `parse: []`, sanitizeArg, 실행 시점 zod 재검증), `bootstrap.ts` graceful shutdown 순서, dashboard `auth.ts` 토큰 로테이션.
