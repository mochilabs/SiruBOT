TOTAL: 14 (HIGH:0 MEDIUM:4 LOW:10)

# packages/utils 인프라 파일군 감사 세그먼트

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 32개 (소스 18개: index, constants, env, version, format, time, logger, sentry, embed, appEmoji, client, memoryCache, memoryFile, operationQueue, pendingRequestPool, redisChannels, redisEnvelope, redisSubscriber + 해당 *.test.ts 14개)
- 감사 기준: 주석 슬롭(antislop-code), AI 코드 슬롭(ai-slop-cleaner), 유저 대상 문자열(copy: R-02, R-15, R-16, R-17/R-36/R-38)
- 판정 보조: 미사용 export·파일 간 중복은 저장소 전체(ts/tsx) 심볼 검색으로 확인. 범위 밖 utils 파일(weather, delivery, social, chatTools, lavalink, player, customCommand, youtube 등)은 읽지 않음.

## Findings

### 1. [MEDIUM] appEmoji 모듈 헤더가 존재하지 않는 심볼명을 가리킨다

- 위치: `packages/utils/src/appEmoji.ts:19-20` (실제 심볼: `packages/utils/src/appEmoji.ts:124` emoji, `packages/utils/src/appEmoji.ts:31` APP_EMOJI_FALLBACKS)
- 규칙: antislop-code 재서술/부정확 문서 (체크리스트: 주석은 코드가 보여주지 않는 새 정보를 정확히 더할 것)
- 사유: 사용 규칙 헤더가 `e('name', fallback)` 별칭과 `EMOTIONS 표`를 언급하지만, 저장소 검색에서 `e(` 별칭 임포트 0건, `EMOTIONS` 심볼 0건이고 실제 이름은 `emoji()`와 `APP_EMOJI_FALLBACKS`다. 새 코드를 읽는 사람을 정반대 이름으로 보낸다.
- 근거:

```ts
// appEmoji.ts:20-21 (발췌)
 *   같은 이름에 폴백이 여러 번 다르게 쓰이지 않게, 표준 폴백은 EMOTIONS 표 한 곳에서만
 *   관리해요. 직접 폴백을 넣는 건 표에 없는 이름뿐이에요.
```

- 제안: 헤더의 사용 규칙을 현재 심볼명(emoji, APP_EMOJI_FALLBACKS)으로 고치고, 별칭을 쓰지 않는 한 `e(` 표기를 지운다.

### 2. [MEDIUM] format.ts의 requester 가드와 센티널 상수 복제

- 위치: `packages/utils/src/format.ts:45-49` (동일 패턴: `apps/bot/src/modules/audio/view/controller.ts:244`, `apps/bot/src/modules/audio/lavalink/requester.ts:18`, `apps/bot/src/modules/audio/lavalink/requester.ts:25`, `apps/bot/src/modules/audio/lavalink/autoPlayRelated.ts:28`, `apps/bot/src/modules/general/commands/profile.ts:264`)
- 규칙: ai-slop-cleaner 파일 간 중복 (복붙 헬퍼)
- 사유: requester 객체에서 id를 뽑는 삼항 가드가 5개 파일 6곳에 복제돼 있고, 48행은 봇의 상수 `RELATED_TRACK_REQUESTER_ID`(`apps/bot/src/modules/audio/lavalink/requester.ts:10`) 대신 `'related_track'` 문자열 리터럴을 직접 쓴다. 45행 주석이 "controller.ts와 동일한 가드"라며 복제를 스스로 인정한다. Sentinel이 갈리면 추천곡 표기가 깨지는 구조다.
- 근거:

```ts
// controller.ts와 동일한 가드: requester가 없거나 문자열이면 .id 접근으로 터지지 않도록 한다.
const requesterId = requester && typeof requester === 'object' ? (requester as { id?: unknown }).id : requester;
if (requesterId === 'related_track') return `추천 곡 ${emoji('sparkle')}`;
```

- 제안: 순수 requester 파서(문자열/객체/센티널 판별)와 센티널 상수를 `@sirubot/utils`로 승격해 봇 코드와 format.ts가 한 구현을 공유하게 한다 (utils는 bot을 임포트할 수 없으므로 상향 승격이 답이다).

### 3. [MEDIUM] MemoryCache.cleanup/clear가 저장소 전체에서 미사용

- 위치: `packages/utils/src/memoryCache.ts:73-85` (cleanup), `packages/utils/src/memoryCache.ts:53-55` (clear)
- 규칙: ai-slop-cleaner 죽은 코드/미사용 export
- 사유: 두 public 메서드의 외부 호출 0건이다. `cache.clear()`/`cache.cleanup()` 전역 검색은 `memoryCache.ts:54`의 내부 호출만 돌려주고, cleanup()은 memoryCache.test.ts에도 없다. 사용 중인 `getStats()`(호출처 `apps/bot/src/modules/audio/lavalink/pendingWriteStore.ts:202`)와 대비된다.
- 근거:

```ts
public cleanup(): number {
	const now = Date.now();
	let removedCount = 0;
```

- 제안: 호출처가 생길 때까지 두 메서드와 (남길 경우) 해당 테스트를 함께 제거하거나, 실제로 TTL 스윕이 필요한 소비처에 붙인다.

### 4. [MEDIUM] 앱 이모지 빈 결과 미캐시·재시도 계약이 한 파일 안에서 3번 반복

- 위치: `packages/utils/src/appEmoji.ts:15-16` (모듈 헤더), `packages/utils/src/appEmoji.ts:174` (ensureAppEmojisLoaded JSDoc), `packages/utils/src/appEmoji.ts:184-186` (본문 주석)
- 규칙: antislop-code 반복 서술 (한 지점에 한 번)
- 사유: "빈 결과는 캐시하지 않는다, 30초 뒤 재시도를 한 번만 예약한다"는 같은 계약이 헤더·JSDoc·본문 주석에 반복되고, 그중 JSDoc(174)과 바로 아래 본문 주석(184-186)은 같은 함수 안에서 같은 말을 이어 쓴다. 137행 플래그 주석까지 포함하면 같은 사실이 4개 지점에 나온다.
- 근거:

```ts
// appEmoji.ts:16 (헤더) / appEmoji.ts:174 (JSDoc)
 *   전체를 폴백으로 고정하지 않게 다음 호출이 재시도하고, 30초 뒤 한 번만 예약 재시도해요)
/** 매핑 로드 (성공 시 최초 1회, 이후 캐시). 빈 결과는 캐시하지 않고 30초 뒤 한 번만 재시도해요. */
```

- 제안: 계약은 JSDoc 한 곳에만 쓰고 헤더는 "로드 순서"만, 본문 주석은 각 줄의 이유(loadPromise 리셋, 재시도 예약)만 남긴다.

### 5. [LOW] redisSubscriber 테스트 주석이 바로 아래 검증과 어긋난다

- 위치: `packages/utils/src/redisSubscriber.test.ts:93` (검증: `packages/utils/src/redisSubscriber.test.ts:96`, 구현: `packages/utils/src/redisSubscriber.ts:73-81`)
- 규칙: antislop-code 재서술/부정확 (정보를 더하지 않고 코드·검증과 다른 말)
- 사유: 주석은 "구독을 등록하지 않고 quit해요"라 말하지만 바로 아래 검증은 `client.subscribe` 호출을 기대한다. 구현 순서도 subscribe 후 stopped 검사, 즉 소켓에는 구독이 걸린 뒤 quit이다. 의도는 아마 `this.subscriber` 미할당인데, 문구 그대로는 검증과 반대다.
- 근거:

```ts
// 진행 중이던 connect가 뒤에 완료돼도 구독을 등록하지 않고 quit해요
...
expect(client.subscribe).toHaveBeenCalled();
```

- 제안: 주석을 "subscribe까지 끝난 뒤에도 this.subscriber에 올리지 않고 즉시 quit한다"로 바꿔 구현·검증과 문자 그대로 맞춘다.

### 6. [LOW] sentry.test가 initSentry·registerProcessErrorHandlers를 검증하지 않는다

- 위치: `packages/utils/src/sentry.test.ts:4` (미커버: `packages/utils/src/sentry.ts:19-46`, `packages/utils/src/sentry.ts:94-105`)
- 규칙: ai-slop-cleaner 테스트 누락 (LOW)
- 사유: 유일한 describe는 scrubSecrets이고, DSN 미설정 시 조용히 비활성화되는 분기와 프로세스 에러 핸들러(unhandledRejection/uncaughtException → flush 후 exit) 경로는 고정되어 있지 않다.
- 근거:

```ts
if (!dsn) {
	console.info('[Sentry] SENTRY_DSN not set, Sentry is disabled.');
	return;
```

- 제안: DSN 부재 시 Sentry.init 미호출, 프로세스 이벤트 발생 시 capture + flush(2000) 후 exit(1)을 고정하는 테스트를 추가한다.

### 7. [LOW] appEmoji.test가 헤더·JSDoc이 강조하는 핵심 계약을 검증하지 않는다

- 위치: `packages/utils/src/appEmoji.test.ts:3-14` (미커버: `packages/utils/src/appEmoji.ts:175-191`, `packages/utils/src/appEmoji.ts:130-132`)
- 규칙: ai-slop-cleaner 테스트 누락 (LOW)
- 사유: 테스트는 setAppEmojiIdMap 병합 한 건만 보고, 빈 결과 미캐시·loadPromise 리셋·30초 예약 재시도 1회·이름 정규식 방어는 전부 미검증이다. finding 4가 지적한 문서의 핵심 동작이 테스트 공백이다.
- 근거:

```ts
describe('app emoji id map', () => {
	it('keeps cached ids when a later sync returns a partial map and prefers refreshed ids', async () => {
		vi.resetModules();
```

- 제안: 빈 파일 로드 시 캐시되지 않고 loadPromise가 리셋되며 예약 재시도가 한 번뿐임을 fake timer로 고정한다.

### 8. [LOW] scrubSecrets JSDoc이 위쪽 상수 주석을 반복하고 감사 이력을 담는다

- 위치: `packages/utils/src/sentry.ts:68-72` (71행 반복 대상: `packages/utils/src/sentry.ts:57`, `packages/utils/src/sentry.ts:59`, 70행 이력 서술)
- 규칙: antislop-code 3줄 초과 과설명 + 재서술 + 이력 제거
- 사유: 4줄 JSDoc의 71행은 바로 위 57-60행 상수 주석이 이미 설명한 두 마스킹 패턴을 다시 쓰고, 70행은 "보안 감사 SEC 후속"이라는 이력을 덧붙인다. 보안 근거 자체는 보존 대상이므로 줄이기만 한다.
- 근거:

```ts
/** 키 이름에 비밀이 들어갈 수 있는 필드는 값을 그대로 노출하지 않아요 */
const SECRET_KEY_PATTERN = /(authoriz|token|secret|passw|api[-_]?key|credential)/i;
/** 문자열 안의 Authorization 헤더/토큰 형태를 마스킹해요 */
```

- 제안: JSDoc을 "재귀 순회(깊이 6, 순환 참조는 [circular])로 값만 마스킹한다" 수준으로 줄이고 보안 근거·두 패턴 설명은 57-62행 상수 주석에만 둔다.

### 9. [LOW] format.ts:137 주석이 바로 위 조건을 영문으로 재서술

- 위치: `packages/utils/src/format.ts:137` (조건: `packages/utils/src/format.ts:131`)
- 규칙: antislop-code Restating the Obvious
- 사유: `hasValidUrl`(uri 존재 + MAX_TRACK_URL_LENGTH 이하)이 말하는 그대로를 else 분기가 이미 보여주는데 주석이 같은 말을 반복하고, 파일의 다른 주석 문체(한국어)와도 섞인다.
- 근거:

```ts
} else {
	// fallback without link if url is too long or missing
	return `${formattedTitle}${lengthStr}`;
```

- 제안: 삭제하거나 "URL이 MAX_TRACK_URL_LENGTH(70)를 넘으면 링크를 끊는다"처럼 상수명과 이유를 남긴다.

### 10. [LOW] memoryCache.test.ts:117 주석이 바로 아래 단언을 반복

- 위치: `packages/utils/src/memoryCache.test.ts:117` (단언: `packages/utils/src/memoryCache.test.ts:118`, 이미 설명 보유: `packages/utils/src/memoryCache.test.ts:108`)
- 규칙: antislop-code Restating the Obvious
- 사유: 단언(`size() <= maxSize`)이 말하는 불변식을 그대로 다시 쓴다. 워크로드가 "포화 상태 삽입"인 이유는 108행 주석에 이미 있어 정보 손실이 없다.
- 근거:

```ts
// 작업이 끝나도 maxSize를 넘지 않아요.
expect(cache.size()).toBeLessThanOrEqual(maxSize);
```

- 제안: 117행 삭제.

### 11. [LOW] onTimeout 순서 계약이 pendingRequestPool 안에서 3번 반복

- 위치: `packages/utils/src/pendingRequestPool.ts:11-12` (모듈 헤더), `packages/utils/src/pendingRequestPool.ts:29` (옵션 JSDoc), `packages/utils/src/pendingRequestPool.ts:54` (register JSDoc)
- 규칙: antislop-code 반복 서술
- 사유: "모든 완료 경로에서 timeoutResult를 먼저 계산한 뒤 onTimeout을 부른다"는 한 줄 규약이 헤더·옵션·메서드 문서에 반복된다. 세 지점 모두 사실이고 정보는 맞지만 한 곳이 기준이고 나머지는 참조여야 읽는 사람이 헷갈리지 않는다.
- 근거:

```ts
 * timeoutResult가 묶인 메타데이터(예: guildId)를 읽을 수 있게 하기 위함이에요.
```

- 제안: 규약은 옵션 JSDoc(29) 한 곳에만 두고, 헤더와 register 문서는 "순서 계약은 timeoutResult/onTimeout 문서 참조"로 한 줄 줄인다.

### 12. [LOW] 진행바 단계 수를 같은 파일 안에서 다르게 센다

- 위치: `packages/utils/src/constants.ts:15` (총 12스텝) vs `packages/utils/src/constants.ts:30` (11단계), 구현 `packages/utils/src/format.ts:27`
- 규칙: antislop-code 모호/불일치 서술 (체크리스트: 주석은 정확한 정보를 더할 것)
- 사유: 15행은 셀당 2스텝, 총 12스텝으로 적고 30행은 6셀 × 2스텝에서 경계 1을 뺀 11단계로 적는다. 구현은 6 × 2 = 12 스텝을 그대로 곱하고(`format.ts:27`), 상태값 s는 0부터 12까지 13가지다. 어떤 기준인지가 주석마다 달라 재사용자가 숫자를 고를 수 없다.
- 근거:

```ts
// constants.ts:15 / constants.ts:30 (총 11단계) / format.ts:27
 * 한 바는 6셀: start + mid×4 + end. 셀당 2스텝(총 12스텝), half 셀이 중간 스텝을 담당해요.
const steps = PROGRESS_BAR_EMOJI_COUNT * PROGRESS_BAR_STEPS_PER_CELL;
```

- 제안: 구현 기준(steps 12, 상태 13가지) 하나로 통일해 한 곳에만 쓰고, 나머지는 한 줄 참조로 줄인다.

### 13. [LOW] sleep 헬퍼가 utils 공용 export와 data-api 지역 구현으로 중복

- 위치: `packages/utils/src/time.ts:35` (공용 export) / `apps/data-api/src/services/memoryTidy.ts:72` (지역 재구현)
- 규칙: ai-slop-cleaner 파일 간 중복 (복붙 헬퍼)
- 사유: 같은 2줄 헬퍼를 `@sirubot/utils/time`이 공용으로 내보내는데, 같은 파일이 countMarkdownEntries 등 utils를 임포트하면서도 sleep만 자체 구현을 유지한다.
- 근거:

```ts
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- 제안: memoryTidy의 지역 sleep을 `import { sleep } from '@sirubot/utils/time'`으로 대체한다.

### 14. [LOW] DEFAULT_COLOR_HEX가 두 배럴에서 재노출되지만 소비처가 없다

- 위치: `packages/utils/src/constants.ts:11`, 재노출 `packages/utils/src/index.ts:8`, `packages/utils/src/client.ts:9`
- 규칙: ai-slop-cleaner 죽은 코드/미사용 export
- 사유: 저장소 전체(ts/tsx) 검색에서 정의·재노출 위치 외 참조 0건이다. 주석은 "컬러피커·강조색 입력의 초기값" 목적을 말하지만 그 목적에 쓰인 코드가 아직 없다.
- 근거:

```ts
export const DEFAULT_COLOR_HEX = `#${DEFAULT_COLOR.toString(16).padStart(6, '0')}`;
```

- 제안: 사용처가 확정되면 그때 연결하고, 그전까지는 배럴 재노출(index, client)과 상수를 함께 제거한다.

## 검사했지만 문제 없는 항목

- **유저 대상 문자열 (R-02, R-15, R-16, R-17/R-36/R-38)**: `constants.ts:4`, `format.ts:48-49`, `format.ts:100-143` 출력 문자열, `time.ts:23-32`, `time.ts:45-47`, `time.ts:51-55`, `memoryFile.ts:21`에 em dash, 범용 CTA, 마케팅 버즈워드, 근거 없는 숫자·보장, 챗봇 클로저가 없다. 표시되는 숫자(진행바 칸, 재생 시간, 업타임)는 전부 코드 계산 결과다.
- **이미지/이모지 장식**: 유저 대상 문자열의 이모지는 `format.ts:48`의 `추천 곡` 접기 하나뿐이고, 디스코드 메시지 관습 + 앱 이모지 폴백 시스템(`appEmoji.ts`) 안의 의도적 선택으로 판단했다. R-04가 막는 "기능 아이콘으로 쓰는 sparkle" 성격이 아니며, `appEmoji.ts:31-119` 표는 데이터다.
- **주석 슬롭 패턴 전체 스캔**: 구분선(등호·하이픈 반복, box drawing), 모호 TODO/FIXME/HACK, 장식 이모지 주석, end marker, 단계 내레이션(Step 1/다음/그 다음), 빈 라벨(Main logic, Note: 중요), JSDoc 시그니처 반복(`@param`/`@returns` 전 범위 0건), 딱딱/외침 문체 전부 미발견.
- **보존 판단 (제거 대상 아님)**: 보안 `sentry.ts:39`, `sentry.ts:57-62`, `redisEnvelope.ts:1-12`; 동시성·재연결 `redisSubscriber.ts:64`, `redisSubscriber.ts:77`, `redisSubscriber.ts:88`, `redisSubscriber.ts:94`, `operationQueue.ts:3`, `memoryCache.ts:20`, `memoryCache.ts:43`; 성능 `version.ts:43`, `memoryCache.test.ts:42-45`; 프로토콜 `redisChannels.ts` 전역, `pendingRequestPool.ts:5-13`, `memoryFile.ts:24-30`; 엣지케이스·워크어라운드 `appEmoji.ts:130`, `appEmoji.ts:143-147`, `appEmoji.ts:154-156`(turbopackIgnore), `format.ts:45`(가드 자체는 복제가 문제), `client.ts:1-8`(배럴 차단 계약)은 실제 정보를 담고 있다.
- **잘못된 레이어 import**: 발견되지 않음. node 전용 모듈(version/child_process, appEmoji/node:fs, logger/tslog, embed/discord.js)의 루트 배럴 누수를 막는 계약이 `index.ts:1-4`와 `client.ts:1-8`에 문서화되어 있고, 범위 파일 어디도 앱 디렉터리를 import하지 않는다.
- **로거 설정 미러**: `logger.ts:3-20`과 app-kit의 이중 정의는 세그먼트 20(app-kit) finding 1이 utils 경로까지 포함해 보고한 상태라 여기서 다시 세지 않았다. `logger.test.ts:4-5`가 미러 동기화 계약을 명시하는 선례로 남아 있다.
- **테스트 커버리지**: 해당 14개 테스트 파일이 실존하며 LRU 회귀 가드(`memoryCache.test.ts:194-214`), 서명 fail-closed(`redisEnvelope.test.ts:27-31`), 풀 타임아웃·용량·중복 id(`pendingRequestPool.test.ts:48-96`), 구독 레이스(`redisSubscriber.test.ts:71-125`), 지연 git 조회 계약(`version.test.ts:24-49`)을 고정한다. 미커버 2건은 finding 6, 7으로 분리했다.
- **테스트 없는 범위 파일**: `client.ts`(재export 배럴), `env.ts`(1줄 상수), `constants.ts`(데이터)는 테스트가 없으나 검증할 동작이 적어 별도 finding으로 세지 않았다.

## 참고 (finding 아님)

- 주석·테스트 제목의 U+2014 문자는 `index.ts:1-3`, `client.ts:5`, `redisEnvelope.ts:6-11`, `embed.test.ts:13`, `sentry.test.ts:4`, `redisSubscriber.test.ts:71`, `redisSubscriber.test.ts:101`, `redisEnvelope.test.ts:7`, `redisEnvelope.test.ts:33`, `pendingRequestPool.test.ts:115`에 있다. 이 감사 지시의 R-02 점검 대상은 유저 대상 문자열이고 그쪽에는 등장하지 않아 finding으로 세지 않았다.
- `memoryCache.test.ts:194-214`의 wall time 성능 단정은 "Fatal #4 회귀 가드"라는 명시적 목적이 있고 `memoryCache.test.ts:209`에 기계 편차 여유 근거가 적혀 있어 finding으로 세지 않았다.
