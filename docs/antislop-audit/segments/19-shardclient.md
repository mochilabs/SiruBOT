TOTAL: 11 (HIGH:3 MEDIUM:2 LOW:6)

# 19. shardclient (packages/shardclient)antislop 감사

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `packages/shardclient/src/**`, `packages/shardclient/package.json`, `packages/shardclient/tsconfig.json`
- 감사 파일 수: 10개 (src 8개: client.ts, index.ts, core/ws.ts, ws-types/index.ts, ws-types/ws-types.test.ts, errors/NoShardsAvailableError.ts, errors/ShardClientError.ts, types/logger.ts / 설정 2개: package.json, tsconfig.json)
- 감사 기준: 주석 슬롭(antislop-code), AI 코드 슬롭(ai-slop-cleaner), 클라이언트 대상 복사(copy)

스니펫 주의: 1, 2, 3번 항목의 코드블록은 리포트 자체의 R-02(U+2014 문자 금지)를 지키기 위해 해당 문자 자리를 `[U+2014]`로 표시했고, 원문의 대시 문자 자체는 옮기지 않았습니다.

### 1. [HIGH] 주석 본문에 em dash 사용
- 위치: packages/shardclient/src/client.ts:51
- 규칙: R-02 (하드 게이트)
- 사유: fatal 경로를 설명하는 주석 문장 중간에 U+2014 문자가 들어 있다.
- 근거:
```ts
// Fatal: no shards available [U+2014] do not retry, let the process exit
```
- 제안: 쉼표 또는 문장 분리로 바꾸고 "do not retry" 규칙 정보는 그대로 유지한다.

### 2. [HIGH] 주석 본문에 em dash 사용 (zod 검증 주석)
- 위치: packages/shardclient/src/core/ws.ts:61 (61~62행)
- 규칙: R-02 (하드 게이트)
- 사유: 검증 목적을 설명하는 2줄 주석의 첫 줄에 U+2014 문자가 들어 있다.
- 근거:
```ts
// manager와 동일하게 zod 스키마로 검증 [U+2014] 깨진/악의적 payload가
// 핸들러에 전달되지 않도록 한다.
```
- 제안: 접속 부호를 쉼표나 문장 부호로 교체하고 검증 보안 근거는 둘 다 유지한다.

### 3. [HIGH] 주석 본문에 em dash 사용 (재연결 정책 주석)
- 위치: packages/shardclient/src/core/ws.ts:73
- 규칙: R-02 (하드 게이트)
- 사유: 재연결 정책을 알리는 주석에 U+2014 문자가 들어 있다.
- 근거:
```ts
// Do NOT auto-reconnect [U+2014] let the caller handle reconnection
```
- 제안: 쉼표나 마침표로 분리하되 호출자 책임이라는 정책 정보는 남긴다.

### 4. [MEDIUM] no-op HEARTBEAT_ACK 핸들러와 빈 라벨 주석
- 위치: packages/shardclient/src/client.ts:159 (JSDoc 156~158행, 주석 161행 포함)
- 규칙: ai-slop-cleaner 체크리스트 "죽은 코드/미사용 export" + antislop-code "Empty Labels"
- 사유: 빈 본문 핸들러는 미등록과 동일한 동작이라 죽은 코드이고, 그 안의 주석은 정보 없는 라벨이다.
- 근거:
```ts
private setupEventHandlers(): void {
	this.ws.on(WsOp.HEARTBEAT_ACK, () => {
		// heartbeat acknowledged
```
- 제안: 핸들러·주석·JSDoc을 함께 제거하거나 미수신 하트비트 감지 같은 실제 동작을 구현한다.

### 5. [MEDIUM] ws 계약의 이중 선언 (인터페이스와 zod 스키마)
- 위치: packages/shardclient/src/ws-types/index.ts:45 (스키마 대응: 82행, 인터페이스 블록 20~58행 / 스키마 블록 60~92행)
- 규칙: ai-slop-cleaner 체크리스트 "중복 로직"
- 사유: 같은 계약이 TS 타입과 zod 스키마에 각각 하드코딩되어 한쪽만 고치면 어긋난다.
- 근거:
```ts
export type ShardStatus = 'ready' | 'connecting' | 'disconnected' | 'errored';
	status: z.enum(['ready', 'connecting', 'disconnected', 'errored']),
```
- 제안: `z.infer<typeof ...Schema>`로 타입을 스키마에서 도출해 열거 리터럴 중복 선언을 없앤다.

### 6. [LOW] JSDoc이 시그니처만 반복 (reidentify)
- 위치: packages/shardclient/src/client.ts:93 (93~95행)
- 규칙: antislop-code "Signature Echo"
- 사유: 문서가 메서드 이름과 매개변수를 그대로 재설명만 한다.
- 근거:
```ts
/**
 * Re-identify with shard manager, sending current shard IDs
 */
```
- 제안: 64~66행 reconnect 주석과 내용이 겹치니 한쪽만 남기고, 남길 문서에는 withShardIds가 바꾸는 것만 적는다.

### 7. [LOW] JSDoc이 시그니처만 반복 (reportStatus)
- 위치: packages/shardclient/src/client.ts:165 (165~167행)
- 규칙: antislop-code "Signature Echo"
- 사유: `reportStatus` 이름이 이미 하는 일을 말하는데 주석이 같은 말을 반복한다.
- 근거:
```ts
/**
 * Report shard status
 */
```
- 제안: 주석을 삭제하거나, identity가 없을 때 조용히 무시되는 동작(client.ts:169) 같은 이름에 없는 사실만 남긴다.

### 8. [LOW] JSDoc이 시그니처만 반복 (onStats)
- 위치: packages/shardclient/src/client.ts:180 (180~182행)
- 규칙: antislop-code "Signature Echo"
- 사유: `onStats(callback)`와 주문이 같은 의미만 전달한다.
- 근거:
```ts
/**
 * Set callback for collecting stats
 */
```
- 제안: 삭제하거나 60초 주기 발송·재등록 시 인터벌 정리 규칙(client.ts:210)처럼 이름에 없는 계약만 남긴다.

### 9. [LOW] 불필요 래퍼: ShardClientError가 아무 정보도 더하지 않음
- 위치: packages/shardclient/src/errors/ShardClientError.ts:1 (1~5행)
- 규칙: ai-slop-cleaner 체크리스트 "불필요 래퍼"
- 사유: 동작 추가가 없고, 루트 index.ts가 이 클래스를 내보내지 않아 패키지 밖에서 잡을 수 없으며 패키지 안에도 `instanceof ShardClientError` 사용처가 없다.
- 근거:
```ts
export class ShardClientError extends Error {
	constructor(message: string) {
		super(message);
```
- 제안: index.ts(1~2행)로 내보내거나 NoShardsAvailableError가 Error를 직접 상속하게 해 계층을 한 단계 줄인다.

### 10. [LOW] 패키지 내부에서 참조되지 않는 ws-types 인터페이스 3종
- 위치: packages/shardclient/src/ws-types/index.ts:41 (동일: 26행 IdentifyPayload, 37행 HeartbeatPayload)
- 규칙: ai-slop-cleaner 체크리스트 "죽은 코드/미사용 export"
- 사유: 세 인터페이스가 src 어디에서도 타입으로 쓰이지 않고, HEARTBEAT_ACK 검증은 HeartbeatPayloadSchema(ws-types/index.ts:104행)로 이뤄진다.
- 근거:
```ts
export interface HeartbeatAckPayload {
	timestamp: number;
}
```
- 제안: `./ws-types`는 공개 subpath라 소비자(shardmanager 등) 사용처를 확인한 뒤 제거하거나 스키마 타입으로 통합한다.

### 11. [LOW] 테스트가 ws 스키마 검증에만 존재
- 위치: packages/shardclient/src/ws-types/ws-types.test.ts:1
- 규칙: ai-slop-cleaner 체크리스트 "테스트 누락" (패키지 내 테스트 파일 1개)
- 사유: 유일한 테스트 파일은 zod 스키마만 다루고, 재연결 백오프·하트비트·재식별 경로는 검증이 없다.
- 근거:
```ts
import { describe, expect, it } from 'vitest';
import { WsMessageSchema, WsOp } from './index.ts';
```
- 제안: identify 실패 재시도, NoShardsAvailableError 조기 종료, ws close 시 재연결 플로우에 대한 테스트를 우선 추가한다.

## 검사했지만 문제 없는 항목

- 구분선·박스 아트·ALL CAPS 배너 주석: 0건 (src 8개 파일의 주석 시작 라인 36줄 전수 확인).
- 장식 이모지(✅, 🚀 등), end marker(`// end if`류), 모호 TODO/FIXME/HACK: 0건 (해당 문자열 grep 결과 없음).
- R-16 버즈워드(seamless, robust, powerful, ultimate 등): 0건 (패키지 전체 grep 결과 없음).
- R-17/R-36 근거 없는 숫자: 0건. 로그·주석의 5s(client.ts:57, 상수 59행), 10s(client.ts:107, 상수 108행), 30_000(client.ts:199), 60_000(client.ts:226)는 모두 같은 파일의 코드 상수와 일치한다.
- 챗봇 클로저·과장 문구: 0건. 이 패키지는 라이브러리로 사용자 대상 텍스트가 없고, 로그 문구(client.ts:57, 88, ws.ts:72 등)는 평이하다.
- R-03, R-23~R-28, R-32~R-35 (모바일·내비게이션·대비·키보드·UI 상태): 해당 없음. 이 패키지에 UI, 테마, 폼 코드가 없다.
- 정보량이 있어 제거하지 않은 주석: ws.ts:41 (빈 catch를 무시하는 이유), ws.ts:61~62 (스키마 검증 보안, 2번 항목은 대시 문자만 지적), ws.ts:89~92 (콜백 계약), client.ts:10~11 (authToken과 authKey의 용도 구분), client.ts:101~103 (핸드셰이크 순서), client.ts:144 (disconnect 시 재연결 연결), client.ts:210 (인터벌 누수 방지).
- 중복 로직 재확인: identify(42~62행)와 reconnect(67~91행)의 공통 연결·핸드셰이크는 sendIdentify(104행)로 이미 추출되어 있어 과잉 중복이 아니다.
- package.json, tsconfig.json: 주석과 문자열이 없고, exports(2개 subpath) 및 tsconfig 구조에서 이상 없음.
- 클라이언트 대상 복사(R-02/R-16/R-17/R-36/R-38)를 적용할 사용자 표면: 없음. 코드 주석의 대시 3건은 R-02로 상단 1~3번에 기록했다.
