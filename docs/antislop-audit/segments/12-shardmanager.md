TOTAL: 11 (HIGH:1 MEDIUM:2 LOW:8)

# 감사 세그먼트: apps/shardmanager (Shard Manager)

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 범위: `apps/shardmanager/src/**`
- 감사 파일 수: 16개 (소스 13, 테스트 2, 타입 선언 1)
- 읽기 전용 감사 (수정·빌드·테스트 실행 없음)

---

## Findings

### 1. [HIGH] 한국어 코드 주석의 em dash(U+2014) 사용이 10곳에 걸쳐 반복돼요

- 위치: `apps/shardmanager/src/server.ts:35`, `apps/shardmanager/src/server.ts:40`, `apps/shardmanager/src/server.ts:42`, `apps/shardmanager/src/core/shardRegistry.ts:11`, `apps/shardmanager/src/core/shardRegistry.ts:71`, `apps/shardmanager/src/core/shardRegistry.ts:75`, `apps/shardmanager/src/core/shardRegistry.ts:90`, `apps/shardmanager/src/routes/ws/index.ts:37`, `apps/shardmanager/src/routes/ws/index.ts:103`, `apps/shardmanager/src/routes/ws/index.ts:123`
- 규칙: R-02 (Hard Gate)
- 사유: 부가절을 em dash로 연결하는 주석 패턴이 앱 전체에서 스타일처럼 반복돼요. R-02는 어떤 텍스트에서도 em dash를 금지해요.
- 근거 (스니펫의 `[EM]`은 em dash 문자를 리포트 R-02 준수용으로 표기 치환한 자리예요):

```ts
// Global error handler [EM] 공용 { error: 코드, message: 한국어 } 계약으로 통일해요.
// maxPayload [EM] 기본값 100MiB 프레임은 인증된 클라이언트가 메모리로 죽일 수 있어요(SEC-004).
// ws readyState 값 [EM] 2(CLOSING)/3(CLOSED)는 이미 끊긴 소켓이에요
```

- 제안: 주석 내용은 그대로 두고 연결 부위의 em dash만 쉼표, 콜론, 괄호로 바꿔요. 보존할 가치가 있는 주석이니 삭제 대상이 아니에요.

### 2. [MEDIUM] 시그니처 재서술 JSDoc 블록이 12개 중 대부분을 차지해요

- 위치: `apps/shardmanager/src/core/shardRegistry.ts:44`, `:111`, `:131`, `:138`, `:157`, `:167`, `:195`, `:208`, `:218`, `:231`, `:245`, `:278`
- 규칙: antislop-code Signature Echo (R-31)
- 사유: 함수 이름과 파라미터가 이미 말해주는 내용을 한 줄 JSDoc으로 되풀이해요. 읽는 사람은 정보가 아니라 분량만 얻어요.
- 근거:

```ts
/**
 * Update heartbeat timestamp
 */
public heartbeat(wsId: string): void {
```

- 제안: 사실을 더하지 않는 블록은 삭제하고, 실제 계약을 담은 `claimShards`(70~76행)와 `getAllProcesses`의 괄호 설명(209행)은 그대로 유지해요.

### 3. [MEDIUM] `ShardRegistry.broadcast()`가 호출처 없이 남아 있는 죽은 코드예요

- 위치: `apps/shardmanager/src/core/shardRegistry.ts:234`
- 규칙: ai-slop-cleaner 죽은 코드/미사용 export
- 사유: 저장소 전체 검색에서 `.broadcast(` 호출이 0건이라 현재 어떤 코드 경로에서도 사용되지 않아요.
- 근거:

```ts
public broadcast<T>(message: WsMessage<T>): void {
	const payload = JSON.stringify(message);
```

- 제안: 매니저에서 봇으로 내려보내는 하향 명령 기능이 계획에 없으면 삭제해요. 있으면 호출처를 연결해 주세요.

### 4. [LOW] 테스트 주석과 내부 문자열 6곳에도 같은 em dash 패턴이 있어요

- 위치: `apps/shardmanager/src/core/shardRegistry.test.ts:128`, `apps/shardmanager/src/routes/ws/index.test.ts:64`, `:78`, `:86`, `:97`, `apps/shardmanager/src/routes/ws/index.ts:40`
- 규칙: R-02 (내부 로그·테스트 문자열은 LOW로 분류)
- 사유: 원인은 1번과 같지만 사용자가 보지 않는 테스트 주석과 내부 로그 문자열이라 영향이 낮아요.
- 근거:

```ts
logger.warn(`[${wsId}] Identify timeout [EM] closing unidentified socket`);
throw new Error(`timed out waiting for ws message [EM] got ${JSON.stringify(this.messages)}`);
```

- 제안: 1번과 함께 일괄 치환하면 돼요.

### 5. [LOW] `validateEnv()` 호출을 그대로 재서술하는 주석이에요

- 위치: `apps/shardmanager/src/index.ts:13`
- 규칙: antislop-code Restating the Obvious
- 사유: 다음 줄의 `const env = validateEnv();`가 이미 하는 일을 한 번 더 말해요.
- 근거:

```ts
// Validate environment variables
const env = validateEnv();
```

- 제안: 삭제해요.

### 6. [LOW] 빈 catch의 `// ignore` 라벨은 아무 정보도 담지 않아요

- 위치: `apps/shardmanager/src/core/shardRegistry.ts:292`
- 규칙: antislop-code Empty Labels
- 사유: 하트비트 타임아웃 해제 중 소켓 close 실패를 무시하는 이유가 없어서, 관용 표기라는 경계 사례예요.
- 근거:

```ts
} catch {
	// ignore
}
```

- 제안: "이미 끊긴 소켓 close 실패는 무해해요" 같은 이유 한 줄로 바꾸거나 그냥 없애요.

### 7. [LOW] 교체 이전 구현의 이력을 길게 서술한 주석이에요

- 위치: `apps/shardmanager/src/server.ts:36`
- 규칙: antislop-code Over-Explained
- 사유: 첫 줄이 이미 통일 이유를 설명하는데, 두 번째 줄은 바꾸기 전 로컬 핸들러의 shape을 다시 묘사해요.
- 근거:

```ts
// Global error handler [EM] 공용 { error: 코드, message: 한국어 } 계약으로 통일해요.
// (기존 로컬 핸들러는 error: 'Internal Server Error' + statusCode만 내려서 영문·shape 이질적이었어요.)
```

- 제안: 계약 통일 한 줄만 남기고 이력은 git 커밋 메시지에 맡겨요.

### 8. [LOW] `GatewayResponse`가 파일 밖에서 쓰이지 않는 export예요

- 위치: `apps/shardmanager/src/utils/gateway.ts:6`
- 규칙: ai-slop-cleaner 미사용 export
- 사유: 이 인터페이스는 같은 파일의 반환 타입과 캐스팅에만 쓰이며 외부 import는 0건이에요.
- 근거:

```ts
export interface GatewayResponse {
	url: string;
```

- 제안: `export` 한정자를 없애 파일 내부 타입으로 좁혀요.

### 9. [LOW] 방어 분기와 알림 계층에 테스트가 없어요

- 위치: `apps/shardmanager/src/routes/ws/index.ts:38`, `apps/shardmanager/src/routes/api/shards/index.ts:5`, `apps/shardmanager/src/routes/api/shards/[id].ts:5`, `apps/shardmanager/src/routes/api/shard/count.ts:4`, `apps/shardmanager/src/routes/api/health/health.ts:4`, `apps/shardmanager/src/utils/discordNotifier.ts:38`
- 규칙: ai-slop-cleaner 테스트 누락 (LOW)
- 사유: ws 핵심 골격은 잘 덮여 있지만 미식별 소켓 타임아웃(4002 종료), 400/404 방어 분기, webhook 전송부에는 검증이 없어요.
- 근거:

```ts
const identifyTimeout = setTimeout(() => {
	if (!registry.getProcess(wsId)) {
```

- 제안: 우선순위는 낮아요. 400/404 분기부터 테스트를 붙이면 돼요.

### 10. [LOW] 프로덕션 타임아웃 상수를 테스트에서 하드코딩으로 복제했어요

- 위치: `apps/shardmanager/src/core/shardRegistry.test.ts:6`
- 규칙: ai-slop-cleaner 중복 (경미)
- 사유: `shardRegistry.ts:8`의 `60_000`을 테스트에서 값으로 다시 적어서, 프로덕션 상수가 바뀌면 테스트 기대와 어긋나요.
- 근거:

```ts
const HEARTBEAT_TIMEOUT_MS = 60_000;
```

- 제안: 프로덕션 상수를 export해서 가져오거나, 값 출처를 주석으로 밝혀요.

### 11. [LOW] 이 앱 유일하게 확장자를 생략한 상대 import예요

- 위치: `apps/shardmanager/src/types/fastify.d.ts:2`
- 규칙: 체크리스트 (코드베이스 일관성)
- 사유: 나머지 15개 파일은 모두 `.ts` 확장자를 쓰는데 이 파일만 `../server`로 적혀 있어요.
- 근거:

```ts
import type { ShardManagerServer } from '../server';
```

- 제안: `../server.ts`로 통일해요. 단, `.d.ts` 동작은 빌드·타입체크 확인 후 바꾸세요 (이 감사는 실행하지 않았어요).

---

## 검사했지만 문제 없는 항목

- R-16 버즈워드: 사용자 대상 Discord 웹훅 메시지(`discordNotifier.ts`) 전문을 확인했고, 금지어(혁명적·차세대·심리스 등)는 없어요. "성공적으로 연결되고 준비됐어요"처럼 상태를 설명하는 문장뿐이에요.
- R-17, R-36, R-38 숫자·보장: 웹훅 임베드에 표시되는 숫자(샤드 수, 프로세스당 샤드)는 모두 런타임 실제 상태값이에요. 출처 없는 통계, 가동률 보장, 과장 표현은 없어요. 코드 주석의 100MiB와 64KiB도 설정값 설명이지 주장이 아니에요.
- 챗봇 클로저, "솔직히 말해"식 오프너, 과장 서사: 사용자 대상 텍스트 전부에서 해당 패턴을 찾지 못했어요.
- 장식용 이모지(antislop-ui/antislop-code): 웹훅 제목의 이모지(🟢🔴📡✅⚠️💀🎉)는 각각 시작, 종료, 연결, 준비, 해제, 타임아웃, 전부 준비라는 실제 상태 변화를 표시해요. 상태 마커로 기능하므로 제거 대상이 아니에요.
- 박스 드로잉 구분선, ALL CAPS 배너, end marker: 16개 파일 전체에서 발견되지 않았어요.
- 모호한 TODO/FIXME/HACK: 전체 검색에서 0건이에요.
- 보존 대상 주석 (antislop-code "Not a ban"에 해당): `server.ts:42-43`(SEC-004 maxPayload 보안·메모리), `routes/ws/index.ts:103-104`(SEC-003 할당 누수 DoS), `routes/ws/index.ts:110`(이중 토큰 검증), `routes/ws/index.ts:37`(미식별 소켓 회수), `routes/ws/index.ts:88`(release 전 hostname 취득 순서), `shardRegistry.ts:70-76`(claim 프로토콜·동시성·레이스), `shardRegistry.ts:90`(중복 해제 방지), `routes/ws/index.test.ts:64,78,97`(ws 프로토콜 타이밍 가정). 모두 길이와 무관하게 정보가 있어 그대로 둬야 해요.
- 중복 로직: 핸들러 4종(identify/heartbeat/status/stats)과 레지스트리 메서드 사이에 로직 복제는 없어요. `formatProcess` 공용화도 적절해요.
- 잘못된 레이어 import: app-kit, shardclient/ws-types, utils/sentry 등 패키지 경계는 모두 지켜져 있어요. 잘못된 상호 참조는 없어요.
- 테스트 품질: `claimShards`의 비정수/범위 초과/중복 거부, 이중 점유 거부, 끊긴 소켓 회수, 유실 할당 자가 치유, 하트비트 타임아웃 해제, all-ready 전이 중복 방지가 실제 값 검증으로 덮여 있어요. 통과용 토큰 테스트가 아니에요.
- R-03, R-25, R-27, R-32 등 UI·접근성·모바일 규칙: 이 범위에는 UI 코드가 없어 해당 없음이에요.
