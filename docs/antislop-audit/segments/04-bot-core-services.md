TOTAL: 13 (HIGH:0 MEDIUM:4 LOW:9)

# 04. 봇 코어·서비스 (apps/bot/src/core, services, lib, types, index.ts)

- 날짜: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 97개 (생산 코드 71, 테스트 26, `modules/` 제외)
- 감사 기준: 주석 슬롭(antislop-code), AI 코드 슬롭(ai-slop-cleaner), 유저에게 보이는 문자열(복사 규칙)

---

## Findings

### 1. [MEDIUM] 영문 JSDoc이 시그니처를 반복하는 주석 군집
- 위치: `apps/bot/src/services/audioService.ts:17` (동일 패턴 외 7곳)
- 규칙: antislop-code 체크리스트 (시그니처 재서술)
- 사유: 함수명과 본문이 이미 말하는 내용을 영문 한 줄로 되풀이해 담긴 정보가 없고, 일부는 이력 잔재나 부정확한 표현까지 함께 붙어 있음.
- 근거:
```ts
/**
 * Gets an existing player or creates a new one for the guild
 */
```
- 같이 플래그된 위치: `audioService.ts:99`("Searches for a track or playlist"), `audioService.ts:293`("Starts playback if the player is not currently playing", 본문은 `if (player.playing) return;` 그대로), `skipPolicy.ts:25`("Handles skip logic, previously in SkipCommand" + 이력 표현), `guildSettings/store.ts:22`, `playlistService.ts:9`(`// Ensure user exists`), `core/bootstrap.ts:168`(`// show pid and pid-name`, 실제로는 PID와 모드만 로깅), `core/logger.ts:6`
- 제안: 코드가 이미 말하는 설명은 삭제하고, 남길 내용이 있으면 계약·엣지케이스만 한국어 한 줄로 통일.

### 2. [MEDIUM] 공용 재생 흐름 함수를 호출하지 않고 같은 시퀀스를 인라인 복제
- 위치: `apps/bot/src/services/aiTools/music.ts:291` (외 2곳)
- 규칙: ai-slop-cleaner 체크리스트 (services 간 중복 로직)
- 사유: audioService가 공용 흐름으로 마련한 이전곡·정지 시퀀스를 AI 도구와 웹 응답자가 그대로 복제해, 한쪽만 고치면 동작이 갈리는 구조임.
- 근거:
```ts
// audioService.ts:311-313 (공용 playPrevious)
await container.mixerService.clearNext(player).catch(() => null);
await container.mixerService.primeForPlay(player);
await player.play({ clientTrack: previousTrack });
```
```ts
// aiTools/music.ts:293-295 (동일 6줄 시퀀스 인라인)
await container.mixerService.clearNext(player).catch(() => null);
await container.mixerService.primeForPlay(player);
await player.play({ clientTrack: previousTrack });
```
- 정지 흐름도 3중복이며 동작이 이미 갈림: `audioService.ts:323` stopPlayback은 `clearNextLenient`(1회 재시도 후 로그)와 `.catch(() => null)`을 쓰는 반면, `aiTools/music.ts:153-156`과 `playerWebResponder.ts:388-391`은 `clearNext`만 쓰고 실패를 그대로 전파함.
- 제안: AI 도구의 이전곡·정지와 웹 제어의 정지를 `audioService.playPrevious` / `audioService.stopPlayback` 호출로 치환.

### 3. [MEDIUM] dataApiClient 카드 렌더러 3개가 같은 fetch 블록을 복제
- 위치: `apps/bot/src/services/dataApiClient.ts:177` (동일 구조 `:200`, `:233`)
- 규칙: ai-slop-cleaner 체크리스트 (중복 로직)
- 사유: URL 가드, POST 전송, content-type 검증, 실패 시 로그 후 null 반환까지 약 15줄이 세 함수에서 거의 동일하고, 타임아웃 20초 상수도 각각 하드코딩됨.
- 근거:
```ts
// dataApiClient.ts:181-183 (renderNowPlayingCard) 와 204-206, 242-244이 동일 구조
const res = await fetch(`${base}/v1/image/nowplaying`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', ...dataApiAuthHeaders() },
```
- 제안: 경로와 본문만 받는 `renderImage(path, body)` 헬퍼로 합쳐 타임아웃·content-type 검증·폴백 규칙을 한곳에 둠.

### 4. [MEDIUM] "Redis 구독 4형제" 주석의 개수가 실제와 다름
- 위치: `apps/bot/src/core/botApplication.ts:111`
- 규칙: ai-slop-cleaner (스테일 정보)
- 사유: 111행 주석이 "Redis 구독 4형제"라고 적혀 있지만 바로 아래 121~127행에서 subscriberLogger를 받는 구독 서비스가 7개 만들어져 읽는 사람을 오도함 (bootstrap의 shutdown 정리 목록도 7개).
- 근거:
```ts
container.guildSettingsInvalidator = new GuildSettingsInvalidator(subscriberLogger);
container.playerWebResponder = new PlayerWebResponder(subscriberLogger, redisSigningKey);
container.jtcSetupResponder = new JtcSetupResponder(subscriberLogger, redisSigningKey);
```
- 제안: 실제 서비스 수에 맞춰 고치거나, 수를 세기 어려운 구조면 개수 대신 "Redis 구독 서비스군" 같은 표현으로 변경.

### 5. [LOW] 응답자 계열의 동일 보일러플레이트 반복
- 위치: `apps/bot/src/services/playerWebResponder.ts:119` (동일 `stop()` 7곳)
- 규칙: ai-slop-cleaner 체크리스트 (중복 로직)
- 사유: 4줄 `stop()`이 7개 파일에서 문자 그대로 같고, 로거 인라인 타입이 8곳, 동일 주석 문구("다른 레플리카가 보유한 길드", "Redis 메시지 서명 키")가 6~7곳에서 복사되어 있음.
- 근거:
```ts
public async stop(): Promise<void> {
  const subscriber = this.subscriber;
  this.subscriber = null;
```
- 로거 타입 중복 위치: `playerWebResponder.ts:81`, `jtcSetupResponder.ts:39`, `guildDataResponder.ts:54`, `socialWebhookResponder.ts:41`, `guildSettingsInvalidator.ts:55` (인라인), `memberGreetingService.ts:107`, `botProfileService.ts:45`, `customCommands/slashRegistry.ts:17` (named interface)
- 제안: `services/types.ts`에 로거 타입을 한 번 선언하고, `stop()`은 작은 공용 헬퍼로 통일.

### 6. [LOW] 파일 내부 전용 별칭 래퍼와 소비되지 않는 반환값
- 위치: `apps/bot/src/services/trackService.ts:53`
- 규칙: ai-slop-cleaner 체크리스트 (불필요 래퍼)
- 사유: import를 그대로 가리키는 private 프로퍼티가 파일 밖 사용처 없이 자기 파일 호출에만 쓰여 간접층이 추가됨 (동일 패턴이 playlistService에도 있음).
- 근거:
```ts
private extractTrackData = extractTrackData;
```
- 같이 플래그된 위치: `services/playlistService.ts:179` (동일 별칭), `services/skipPolicy.ts:154` (`checkDJRole`가 항상 `return true`인데 `handleSkip:29`와 테스트가 반환값을 무시)
- 제안: 별칭은 제거하고 함수를 직접 호출하며, 쓰이지 않는 boolean 반환도 정리.

### 7. [LOW] 반복 문자로 감싼 장식 구분선 주석
- 위치: `apps/bot/src/services/playerWebResponder.ts:182` (동일 패턴 10곳)
- 규칙: antislop-code 체크리스트 (장식 구분선)
- 사유: 라벨 내용 자체는 정보지만 반복 부호로 감싼 형태가 장식형 AI 주석의 전형 패턴이라 평문 한 줄로 충분함.
- 근거:
```ts
// ── kind: voice-context ── 사용자 음성·권한 상태만 돌려줘요 (권한 제한 없음)
```
- 같이 플래그된 위치: `playerWebResponder.ts:208`, `:244`, `:322`, `core/env.ts:22`, `:38`, `:58`, `:69`(`// --- ... ---`), `services/types.ts:9`, `:27`
- 제안: 장식 부호를 빼고 본문 정보만 평문 한 줄로 유지.

### 8. [LOW] 파일 외부에서 임포트되지 않는 export 19종
- 위치: `apps/bot/src/core/env.ts:85` (외 18종)
- 규칙: ai-slop-cleaner 체크리스트 (미사용 export)
- 사유: 선언 파일 밖의 임포트 사용처가 하나도 없는데 export가 붙어 있음. 코드 자체는 파일 내에서 쓰이므로 동작에는 영향이 없고 키워드 수준의 정리 대상임.
- 근거:
```ts
export type BotEnv = z.infer<typeof botEnvSchema>;
export const TTS_GUILD_CONCURRENT_SYNTH = 2;
```
- 나머지 17종: `CustomCommandChannel/GuildContext/MemberContext/RoleInfo/RunResult/TriggerMessage`(interpreter.ts), `ProfileCardRequest/NowPlayingCardRequest/MemberCardRenderContext`(dataApiClient.ts), `TtsShareFormat/TtsSynthOptions`(ttsService.ts), `TtsTextResolvers`(chatTts.ts), `PlaybackReportType/NodeReportType`(playbackReporter.ts), `WebhookRelayOptions`(webhookRelay.ts), `MemberGreetingTestState`(memberGreetingService.ts), `MEMORY_FILE_ABOUT`(aiMemoryService.ts)
- 제안: 외부 공개 계약이 아니면 export 키워드를 제거하고, 공개 계약이라면 실제 사용처를 연결.

### 9. [LOW] 숫자 단계 라벨이 아래 코드를 재서술
- 위치: `apps/bot/src/services/appEmojiManager.ts:49` (동일 `:54`)
- 규칙: antislop-code 체크리스트 (재서술, 단계 내레이션)
- 사유: `// 3)`과 `// 4)` 라벨은 밑의 코드를 그대로 반복해 번호만 남고 정보가 없음 (1)과 2)는 오프라인 폴백·shard 0 같은 사실을 닫고 있어 유지 가능).
- 근거:
```ts
// 3) 미등록 PNG 업로드 (shard 0)
if (upload) {
  await this.uploadMissing(application, map);
```
- 제안: 숫자 단계 표시를 없애고, 남길 정보(오프라인 폴백, shard 0 전용 동기화)만 본문 주석으로 유지.

### 10. [LOW] 같은 안내문에 이모지 접두가 있거나 없음
- 위치: `apps/bot/src/services/playerWebResponder.ts:336` (대조 `:419`)
- 규칙: R-31 (이유 없는 장식 판단), 유저 안내문 일관성
- 사유: 동일 문구 "재생 제어는 서버 관리자 또는 DJ 역할이 필요해요."가 한 곳은 접두 이모지, 다른 곳은 없이 나가 대시보드 오류 표시가 문구마다 달라짐.
- 근거:
```ts
this.respond({ requestId: request.requestId, guildId, kind: 'control', error: '재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.' });
```
```ts
return { error: `${emoji('error')} 재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.` };
```
- 제안: 대시보드 error 문자열에 접두 이모지를 쓸지 말지 정해 한쪽으로 통일.

### 11. [LOW] 유저 안내문 이모지 뒤 이중 공백
- 위치: `apps/bot/src/services/audioService.ts:117` (동일 `:125`)
- 규칙: antislop-copywriting 체크리스트 (하이진)
- 사유: 같은 파일의 다른 안내문은 이모지 뒤 공백 1개인데 두 곳만 2개라 화면에서 공백이 더 넓게 보이는 문장 부호 오류.
- 근거:
```ts
message: '🛠️  음악 검색 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
```
- 제안: 이모지와 문구 사이 공백을 파일 내 다른 안내문과 동일하게 1개로 통일.

### 12. [LOW] AI 도구 상태 멘트의 줄임표 표기 불일치
- 위치: `apps/bot/src/services/aiTools/music.ts:71` (동일 패턴 26곳)
- 규칙: antislop-copywriting 체크리스트 (하이진, 일관성)
- 사유: 도구 status 멘트는 모두 "중.."(2점)인데 기본 폴백만 "사용 중..."(3점)이라 유저 채널 멘트의 줄임표 표기가 갈림.
- 근거:
```ts
status: '시루가 음악을 찾는 중..',
```
```ts
if (!tool?.status) return `${name} 사용 중...`;
```
- 제안: `…`, `...`, `..` 중 하나를 골라 26곳과 `aiTools/index.ts:45` 폴백을 통일.

### 13. [LOW] 대응 테스트가 없는 생산 파일
- 위치: `apps/bot/src/services/audioService.ts` (생산 71개 중 대응 `*.test.ts` 없는 파일 45개, 타입 선언 1 포함)
- 규칙: ai-slop-cleaner 체크리스트 (테스트 누락, LOW)
- 사유: 로직이 있음에도 대응 테스트가 없고, 같은 응답자 계열 안에서도 테스트 유무가 갈려 회귀 방지 편차가 큼.
- 근거:
```text
테스트 있음: playerWebResponder, memberGreetingService, guildDataResponder, guildSettingsInvalidator
테스트 없음: botProfileService, socialWebhookResponder, jtcSetupResponder
```
- 그 외 대표 미테스트: `audioService.ts`(UserError 분기·큐잉), `playlistService.ts`(트랜잭션·중복 체크), `trackService.ts`, `tempVoiceService.ts`(방 생성·소유권 이전·빈방 삭제), `dataApiClient.ts`, `webhookRelay.ts`, `lib/discordErrorText.ts`. 단, `aiChatService.test.ts`와 `guildService.test.ts`가 하위 모듈(aiChat/, guildSettings/)을 일부 커버함.
- 제안: 큐잉·권한 분기·캐시 무효화 같은 핵심 로직과 미테스트 응답자 3종부터 보강.

---

## 검사했지만 문제 없는 항목

- **R-02 (em dash, U+2014)**: 유저에게 보이는 문자열(UserError 메시지, 대시보드 error 안내, 채널 전송 문구)에서 0건. 주석·테스트 이름에는 대시가 있으나 이번 감사의 R-02 적용 범위(유저 보이는 문자열) 밖이라 플래그하지 않음.
- **R-16 (버즈워드), R-15 (범용 CTA)**: 유저 안내문 기준 0건 (세상·최고·혁신·완벽·무제한·강력한·편리·매끄럽·seamless·effortless 등 grep 0건, "지금 바로/시작해 보세요/자세히 알아보기"류 CTA 0건).
- **R-17, R-36, R-38 (근거 없는 숫자·보장)**: 유저 문구의 숫자는 전부 코드 상수 또는 Discord 실제 한도와 일치 (music_tts 200자 = `music.ts:460` 검사, 플레이리스트 100곡 = `music.ts:494`, 대기열 15곡 = `music.ts:172`, 웹훅 한도 10개 = Discord 채널 한도). 근거 없는 수치·보장문 0건.
- **R-18, R-23, R-24, R-28, R-32~R-35**: 인용문, 자산 생성, 내비게이션, FAQ, 키보드·테마·대비 UI가 감사 범위 내에 없음 (해당 UI는 `modules/`의 뷰 빌더 소관).
- **R-03, R-25, R-26, R-27**: 레이아웃·비교 대비·인터랙션 컨트롤·빈/로딩/에러 상태는 `modules/` 레이아웃 영역이라 범위 밖. 범위 내 데이터 응답자에는 실패 시 한국어 사유 응답이 있어 상태 누락은 없음.
- **챗봇 클로저**: "도움이 되셨나요", "궁금한 점은 언제든지"류 0건. `aiChat/prompt.ts:21`은 오히려 이모지 자제와 상투적 표현 억지를 지시하는 프롬프트임.
- **주석 슬롭 전수 스캔**: `// ====` 계열 구분선, `// ----` 박스 헤더, ALL CAPS 박스, Step 내레이션(`// Step 1`), 빈 라벨(`// Main logic` 등), TODO/FIXME, 장식 이모지 주석, end marker는 범위 내 0건 (apps/bot/src 전체 grep 결과 없음).
- **보존 대상으로 플래그하지 않은 주석**: `mixerService.ts`의 라바링크 플러그인 프로토콜·직렬화 주석, `aiTools/webFetch.ts`의 SSRF 방지 주석, `guildSettings/store.ts`의 무효화 세대 경쟁 처리 주석, `core/bootstrap.ts`의 종료 순서·health 그레이스 주석, `ttsService.ts`의 재시도 예산 주석, `botApplication.ts`의 allowedMentions 멘션 주입 방지 주석. 보안·성능·동시성·프로토콜·엣지케이스 설명이라 명시적 플래그 금지 대상.
- **디버그 잔재**: 범위 내 `console.log`, `debugger`, `process.env.DEBUG` 0건. `core/bootstrap.ts`의 `console.error`는 로거 준비 전 기동 차단 출력, `index.ts`의 `console.error`는 fail-closed 종료 출력으로 의도적임.
- **계층 경계**: `services`가 `modules`의 뷰 빌더·유틸을 임포트하는 사례(`audioService.ts:7`, `skipPolicy.ts:7`, `aiTools/music.ts:13` 등)는 명시된 금지 규칙이 없고 관례적 사용이라 위반으로 보지 않음. `core`의 container 할당 위치(`lavalinkHandler`, `shardClient`)는 AGENTS.md 규약과 일치.
- **퍼사드 계층**: `GuildService`(위임 메서드 40여 개), `AiChatService`(re-export 바렐)는 불필요 추상화로 보지 않음. 각 파일 헤더에 소비자 계약 유지 사유와 모듈 책임 표가 명시된 아키텍처 결정이기 때문.
- **core 내부 구조 유사**: `core/environment.ts`의 `unhandledRejection`/`uncaughtException` 핸들러는 형태가 같지만 태그·로그 레벨·메시지가 달라 중복으로 판단하지 않음.
- **유저 채널로 나가는 한국어 로그**: 범위 내 없음. 모든 `logger.*`는 콘솔·Sentry용이며, 실제 채널 출력은 `tempVoiceService.ts:228` 안내문과 응답자 error 문자열뿐이라 이쪽만 유저 보이는 문자열 기준으로 점검함.
- **테스트 파일 26개**: 주석 슬롭 패턴(구분선·TODO·장식 주석·단계 내레이션) 0건. `describe`/`it` 이름은 대부분 한국어 사실 서술이며 내부 문자열이라 R-02 적용 범위 밖.
