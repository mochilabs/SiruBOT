TOTAL: 7 (HIGH:1 MEDIUM:2 LOW:4)

# 03. 봇 voice/games 모듈 antislop 감사

- 날짜: 2026-10-22
- 브랜치: chore/antislop-audit
- 범위: `apps/bot/src/modules/voice/**`, `apps/bot/src/modules/games/**`
- 감사 파일 수: 12 (voice 2, games 10)
- 읽기 전용 감사. 코드·설정·테스트는 수정하지 않음.

## findings

### 1. [HIGH] 코드 주석 6곳에 em dash(U+2014) 문자 사용 (R-02)

- 위치: `apps/bot/src/modules/games/interaction-handlers/games.ts:9`, `apps/bot/src/modules/games/utils/gameRecords.ts:138`, `apps/bot/src/modules/games/utils/gameRecords.ts:150`, `apps/bot/src/modules/games/utils/gameRecords.test.ts:12`, `apps/bot/src/modules/games/utils/gameRecords.test.ts:32`, `apps/bot/src/modules/games/commands/ohaasa.ts:127`
- 규칙: R-02 (하드 게이트, 문자 자체 금지)
- 사유: 유저 노출 문자열에는 0건이지만, 에이전트가 작성한 주석 텍스트 6곳에 em dash가 들어 있다. R-02는 문자 단위 금지라 예외가 없다.
- 근거 (괄호 표시 위치가 em dash 문자):
  - `/** outcome: 0 = 비김, 1 = 승, 2 = 패 [em dash] 표시할 연승 문구가 있으면 반환 */`
  - `* Redis 없으면 보호 불가 [em dash] 기존 동작(락 획득한 것으로 간주)을 유지한다.`
  - `// 락은 선점됐지만 레코드가 아직 안 보이는 진행 중 구간 [em dash] 기록된 streak로 응답`
- 제안: 각 주석의 em dash만 쉼표·마침표·괄호로 치환한다. `gameRecords.ts:138/150`은 Redis 락 동시성 설명이라 내용은 보존하고 구두점만 바꾼다.

### 2. [MEDIUM] ohaasa 주석이 출력 구조를 열거하면서 실제 렌더에 없는 항목을 잘못 기술 (주석 슬롭: 재서술 + 부정확)

- 위치: `apps/bot/src/modules/games/commands/ohaasa.ts:127`
- 규칙: antislop-code "Restating the Obvious" / "Over-Explained Comment" (MEDIUM)
- 사유: 바로 아래 `let target` 선언과 떨어져 있고, `buildSingleLines`/`buildTopLines`이 이미 보여주는 출력 구조를 열거한다. 게다가 열거에 들어간 "번역 안내"는 어느 함수에도 렌더되지 않는 항목이라 낡은 설명이다.
- 근거:
  ```
  // 본문: 제목·날짜·별자리·순위·운세 설명·럭키 정보·출처/번역 안내 [em dash] 복사하기 쉬운 텍스트예요.
  let target: HoroscopeData | null = null;
  ```
- 제안: 주석을 제거한다. 남기려면 실제 렌더와 일치하는 한 줄(예: 출처 문구는 빌드 함수에 있음)로 줄인다.

### 3. [MEDIUM] games 모듈 공통 컨테이너 래퍼 중복 (중복 로직)

- 위치: `apps/bot/src/modules/games/interaction-handlers/games.ts:27`
- 규칙: ai-slop-cleaner "중복 로직"
- 사유: `noticeContainer`(games.ts:27-31)와 `guess.ts:15-19`의 `resultContainer`는 본문이 동일한 createContainer 래퍼다. checkin·fortune·ohaasa·dice는 같은 `createContainer + addTextDisplayComponents` 부트스트랩을 인라인으로 4회 더 반복하며, dice만 IIFE로 인라인 생성한다.
- 근거:
  ```
  function noticeContainer(text: string) {
  	const container = createContainer();
  	container.addTextDisplayComponents((t) => t.setContent(text));
  ```
  (`guess.ts:15-19`의 `resultContainer`와 동일 구조, `dice.ts:69-81`은 동일 동작의 IIFE)
- 제안: games 모듈 공용 헬퍼(예: `textContainer(lines)`) 하나로 합치고, dice의 IIFE를 일반 상수 선언으로 바꾼다.

### 4. [LOW] ohaasa 주석이 바로 아래 삼항 연산자를 그대로 재서술 (주석 슬롭: 재서술)

- 위치: `apps/bot/src/modules/games/commands/ohaasa.ts:133`
- 규칙: antislop-code "Restating the Obvious" (LOW, 경미)
- 사유: 주석이 다음 줄 삼항 연산자의 의미를 그대로 말한다. 코드만으로 충분하다.
- 근거:
  ```
  // 본문 라인: 별자리 지정이면 단일 운세, 아니면 TOP 3 요약이에요.
  const lines = target ? buildSingleLines(daily, target) : buildTopLines(daily);
  ```
- 제안: 주석 제거.

### 5. [LOW] fortune에서 등급·럭키 이모지 선택에 하드코딩 5 사용 (일관성)

- 위치: `apps/bot/src/modules/games/commands/fortune.ts:55`
- 규칙: ai-slop-cleaner "불필요한 반복/마법 상수" (LOW)
- 사유: 같은 함수 안에서 fortune·color는 `.length`로 나누는데 grade와 luckyEmoji는 고정 `5`를 쓴다. 배열 길이가 바뀌면 `undefined` 항목이 그대로 렌더된다.
- 근거: `const grade = getGrades()[parseInt(hash.slice(8, 16), 16) % 5];` (58행 luckyEmoji도 동일하게 `% 5`)
- 제안: `% getGrades().length`, `% getLuckyEmojis().length`로 통일.

### 6. [LOW] GAME_IDS에 범위 내 사용처가 없는 'dice', 'quiz' 항목 (죽은 코드 의심)

- 위치: `apps/bot/src/modules/games/utils/gameRecords.ts:6`
- 규칙: ai-slop-cleaner "죽은 코드/미사용 export" (LOW, 범위 외 호출 가능성 미확인이라 경미 분류)
- 사유: 이 감사 범위에서 `recordGameResult` 호출은 'rps'(games.ts:13), 'guess'(guess.ts:102, 128), 'attendance'(gameRecords.ts:156)뿐이다. dice.ts는 gameRecords를 아예 임포트하지 않고, quiz 커맨드는 이 모듈에 없다.
- 근거: `const GAME_IDS = ['rps', 'guess', 'dice', 'attendance', 'quiz'] as const;`
- 제안: 범위 외 사용처 확인 후 미사용 항목을 제거하거나, 미사용인 이유(타입 유니온 확장 예약)를 한 줄 주석으로 남긴다.

### 7. [LOW] 게임 유틸 일부 함수에 테스트 누락 (테스트 누락)

- 위치: `apps/bot/src/modules/games/utils/ohaasaService.ts:20`
- 규칙: ai-slop-cleaner "테스트 누락" (LOW)
- 사유: `gameRecords.test.ts`는 KST 자정 경계·Redis 락 경합·깨진 meta까지 커버하지만, `getZodiacFromDate`(달/일 경계 12분기)와 `gameRecords.ts:104`의 `getGuessBest`(경계값 비교)는 테스트가 없다. 두 함수 모두 경계일 기준이라 회귀 위험이 있다.
- 근거: `export function getZodiacFromDate(month: number, day: number): string | null {`
- 제안: 별자리 경계일(예: 3/21, 12/22)과 `getGuessBest`의 최솟값 갱신 케이스 테스트를 추가.

## 검사했지만 문제 없는 항목

- voice 리스너 2종 (`tempVoiceChannelDelete.ts`, `tempVoiceState.ts`): 주석 없음, 위임 패턴, 에러는 로깅으로 격리. 슬롭·문자열 문제 없음.
- 유저 노출 문자열 전체(embed 문구, UserError, 안내문): em dash 0건, 근거 없는 확률·당첨률·보장 문구 0건, 마케팅 buzzword 0건, 범용 CTA 0건, 챗봇 클로저 0건.
- 게임 안내문의 숫자(6번 기회, 7/30/100/365일 마일스톤, 1~100 범위, 주사위 1~20개·2~1000면): 모두 코드 상수와 일치해 R-17/R-36 위반 없음.
- ohaasa 출처 표기(`아사히 방송 오하아사`, `TV 아사히`): 실제 외부 데이터 소스 표기라 R-36 위반 없음.
- 보존 대상 주석(플래그 제외): `checkin.ts:7`·`fortune.ts:20`(이모지 매핑 로드 타이밍 제약), `games.ts:35`(앱 이모지 표에 패배 계열이 없어 유니코드 유지), `gameRecords.ts:134-139`·`145`·`150`(Redis 락 원자화 계약과 레이스 구간 설명)은 비즈니스 로직·동시성 설명이라 내용 유지 대상. finding 1은 이 주석들의 구두점 교체만 요구한다.
- `gameRecords.test.ts` 품질: KST 자정 직전/직후, 스트릭 끊김, 락 선점 구간, 깨진 meta 대응까지 커버돼 있다.
- 주석 슬롭 패턴 전체 점검: 구분선·ALL CAPS 박스 헤더·Step 내레이션·빈 라벨·모호한 TODO·JSDoc 시그니처 반복·장식 이모지 주석·end marker 0건.
- 게임 응답 이모지(앱 이모지 + 유니코드 대체): 봇의 기존 렌더 스타일과 일관되며 패배 계열 유니코드는 `games.ts:35`에 사유가 남아 있어 남용으로 판단하지 않음.
