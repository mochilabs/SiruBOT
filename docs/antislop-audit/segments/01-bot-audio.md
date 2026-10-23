TOTAL: 9 (HIGH:0 MEDIUM:3 LOW:6)

# 01. bot 오디오 모듈 (apps/bot/src/modules/audio)

- 날짜: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 102개 (commands 7, subcommands 15, view 16, interaction-handlers 8, lavalink 24, preconditions 9, listeners 4, managers 2, utils 5, test 12)

주석 슬롭(antislop-code), AI 코드 슬롭(ai-slop-cleaner), 유저 대면 문자열(복사라이팅) 3개 축으로 전수 확인했습니다. 아래는 근거가 확보된 항목만 기재했고, 패턴 기반 검색(구분선·TODO·이모지 장식 주석·단계 내레이션·end marker·버즈워드)은 0건이었습니다.

---

### 1. [MEDIUM] 렌더되지 않는 볼륨 버튼과 그 핸들러가 죽은 코드로 남아 있음

- 위치: `apps/bot/src/modules/audio/view/controller.ts:117-129`, `apps/bot/src/modules/audio/view/controller.ts:157-159`, `apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts:34`, `apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts:98-100`, `apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts:220-238`
- 규칙: ai-slop-cleaner (죽은 코드 / 도달 불가능 분기)
- 사유: 볼륨 버튼이 주석 처리돼 컨트롤러에 그려지지 않으므로 `controller:volume:up/down` customId가 어떤 경로에서도 만들어지지 않습니다. 그런데도 `case 'volume'` 핸들러, `handleVolume`, DJ_COMMANDS의 `'volume'` 항목이 살아 있어 도달 불가능한 기능이 유지보수 대상처럼 남아 있습니다.
- 근거:
  ```ts
  // 	.setCustomId(wrapPrefix('volume:down'))
  // 	.setCustomId(wrapPrefix('volume:up'))
  private static readonly DJ_COMMANDS = new Set([... 'chapter', 'volume']);
  ```
- 제안: 볼륨 컨트롤이 의도적 제거라면 버튼·핸들러·DJ 항목을 함께 삭제하고, 의도된 기능이라면 버튼을 다시 노출해 핸들러와 연결하세요.

### 2. [MEDIUM] playerNotifier에 빈 라벨·재서술 주석이 군집함

- 위치: `apps/bot/src/modules/audio/lavalink/player/playerNotifier.ts:44`, `:76`, `:80`, `:88`, `:156`, `:264`, `:300`, `:344`, `:370`
- 규칙: antislop-code (Empty Labels, Restating the Obvious)
- 사유: 메서드 이름을 그대로 반복하거나 동작을 서술만 하는 주석이 반복됩니다. `// Clear debounce timer`는 `clearDebounceTimer`, `// Delete controller message`는 `deleteController`, `// Event handlers`는 카테고리 이름만 달 뿐 코드가 이미 보여주는 정보를 되풀이합니다. 한 파일에 9곳이 몰려 밀도가 높습니다.
- 근거:
  ```ts
  // Force send controller message
  // Clear debounce timer
  // Event handlers
  ```
- 제안: 메서드 이름·동작을 반복하는 라벨은 제거하고, 실제 이유·제약·트레이드오프를 담는 주석만 남기세요. (예: 18행, 24-28행, 170-174행처럼 동기화·무효화 사유를 설명하는 주석은 보존 대상입니다.)

### 3. [MEDIUM] errorView 헬퍼를 무시하고 동일 에러 컨테이너를 10회 인라인 복붙함

- 위치: `apps/bot/src/modules/audio/commands/favorites.ts:150`, `:213`, `:296`, `apps/bot/src/modules/audio/commands/playlist.ts:154`, `:173`, `:231`, `:285`, `:316`, `:343`, `:423`
- 규칙: ai-slop-cleaner (파일 간 중복 로직 / 기존 헬퍼 미사용)
- 사유: `apps/bot/src/lib/errorView.ts`의 `errorView(message)`와 정확히 같은 결과를 만드는 식을 10번 그대로 반복합니다. 같은 모듈의 다른 파일(controllerButton, lyrics, recommend, stop)은 이미 `errorView`를 쓰고 있어 사용 규칙이 흔들립니다.
- 근거:
  ```ts
  components: [createContainer().addTextDisplayComponents((t) => t.setContent(`${emoji('error')} ${getErrorMessage(error)}`))],
  ```
- 제안: 이 10곳을 `errorView(...)` 호출로 치환해 중복을 제거하고 에러 표기 규칙을 한 곳으로 모으세요.

### 4. [LOW] filter.ts 안에서 프리셋 이름→라벨 매핑 로직이 두 번 중복됨

- 위치: `apps/bot/src/modules/audio/view/filter.ts:45-50`, `apps/bot/src/modules/audio/view/filter.ts:98-103`
- 규칙: ai-slop-cleaner (파일 내 중복 로직)
- 사유: 같은 카탈로그(FILTER_PRESETS)를 `find`로 찾아 라벨+이모지 문자열을 만드는 5줄 로직이 두 함수에 동일하게 존재합니다.
- 근거:
  ```ts
  const preset = FILTER_PRESETS.find((p) => p.name === name);
  return preset ? `${filterPresetEmoji(preset)} ${preset.label}` : name;
  ```
- 제안: 라벨 매핑 함수를 하나 추출해 두 곳에서 공유하세요.

### 5. [LOW] 디스코드 옵션 제약이 이미 강제하는 값에 대해 런타임 검사가 도달 불가능함

- 위치: `apps/bot/src/modules/audio/subcommands/volume.ts:43`, `apps/bot/src/modules/audio/subcommands/repeat.ts:47`, `apps/bot/src/modules/audio/subcommands/tts.ts:43`
- 규칙: ai-slop-cleaner (도달 불가능 분기)
- 사유: 각각 `setMinValue(0)/setMaxValue(150)`, `addChoices(...)`, `setMaxLength(200)`로 디스코드가 값을 강제합니다. 클라이언트·서버 모두 이 범위 밖의 값을 보낼 수 없어 런타임 검사는 사실상 죽은 방어 분기입니다.
- 근거:
  ```ts
  .setMinValue(0)
  .setMaxValue(150)
  // ...
  if (volume < 0 || volume > 150) {
  ```
- 제안: 검증을 신뢰해 분기를 제거하거나, 방어 목적이면 그 사실을 한 줄 주석으로 밝혀 독해 오용을 막으세요.

### 6. [LOW] 유저 대면 문자열의 이모지 표기가 세 가지 방식으로 갈림

- 위치: `apps/bot/src/modules/audio/managers/voteSkip.ts:110`, `:113`, `apps/bot/src/modules/audio/lavalink/player/playerNotifier.ts:59`, `apps/bot/src/modules/audio/lavalink/handlers/queueAdvancer.ts:148`, `:182`, `:330`, `apps/bot/src/modules/audio/lavalink/handlers/sponsorBlockHandler.ts:46`, `apps/bot/src/modules/audio/subcommands/previous.ts:21`, `:29`, `apps/bot/src/modules/audio/subcommands/recommend.ts:37`, `:45`
- 규칙: R-04 (일관성), ai-slop-cleaner (중복·불일치)
- 사유: 같은 모듈 안에서 (1) 앱 이모지 `emoji('error')`, (2) 리터럴 유니코드 `❌` `📭` `🚫` `🎵` `⏩`, (3) 이모지 없음 세 방식이 섞여 있습니다. 서식이 일관되지 않아 화면마다 인상이 달라집니다.
- 근거:
  ```ts
  return '❌ 이미 투표에 참여했어요.';
  message: '🎵 재생 상태가 바뀌었어요. `/현재곡`으로 다시 확인해 주세요.',
  ```
- 제안: 봇 프로필 이모지 체계(`emoji()`)로 통일하거나, 이모지 유무 기준을 한 문서로 정해 규칙을 고정하세요.

### 7. [LOW] 영문 재서술·내레이션성 단발 주석이 흩어져 있음

- 위치: `apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts:383`, `:417`, `apps/bot/src/modules/audio/subcommands/lyrics.ts:33`, `:63`, `apps/bot/src/modules/audio/interaction-handlers/settings.ts:125`
- 규칙: antislop-code (Restating the Obvious, Workflow Narration)
- 사유: 코드가 이미 보여주는 동작을 서술만 하는 주석입니다. 한글 주석 위주 코드베이스에서 영문 내레이션이 섞여 가독성과 일관성을 떨어뜨립니다. (`lyrics.ts:69`의 `// Truncate if too long (Discord limit)`처럼 실제 제약을 밝히는 주석은 보존 대상입니다.)
- 근거:
  ```ts
  // Skip to the specified position (remove tracks before it and play it)
  // If no query, try to use current playing track
  // Update player if exists
  ```
- 제안: 동작 서술은 삭제하고, 이유·제약을 설명하는 주석만 남겨 언어를 통일하세요.

### 8. [LOW] 복잡한 전이(트랜지션) 로직에 대한 테스트가 없음 (참고)

- 위치: `apps/bot/src/modules/audio/lavalink/handlers/queueAdvancer.ts`, `apps/bot/src/modules/audio/lavalink/handlers/playbackWatchdog.ts`, `apps/bot/src/modules/audio/lavalink/handlers/playerHandler.ts`, `apps/bot/src/modules/audio/lavalink/handlers/sessionRestore.ts`, `apps/bot/src/modules/audio/lavalink/handlers/trackStartOrchestrator.ts`
- 규칙: 테스트 누락 (참고용 LOW)
- 사유: `queueAdvancer.ts`와 `playbackWatchdog.ts`는 α/β 이벤트 순서, 예열 소비, watchdog 복구, queueEnd 조기 분기 등 분기 밀도가 높은 상태기계인데 대응 테스트 파일이 없습니다. 반면 `trackHandler`·`nodeHandler`·`playerNotifier` 등에는 테스트가 있어 기준이 일관되지 않습니다.
- 근거: 해당 디렉터리의 test 파일 목록에 `queueAdvancer.test`, `playbackWatchdog.test`가 없음.
- 제안: 우선순위가 높은 전이 분기(queueEnd 조기 종료, watchdog 복구)부터 회귀 테스트를 갖추면 안정화에 기여합니다.

### 9. [LOW] 주석 오타로 문장이 깨짐

- 위치: `apps/bot/src/modules/audio/managers/voteSkip.ts:30`
- 규칙: antislop-code (주석 품질, 경미)
- 사유: 의미 있는 주석인데 "스킵 표표 수"로 글자가 겹쳐 오타가 있어 문장이 어색합니다.
- 근거:
  ```ts
  * 청취 가능 멤버의 과반 스킵 표표 수 — VoteSkip.requiredVotes와 단독 스킵 판정(isUserAlone)이
  ```
- 제안: "필요 표 수"로 교정해 한 글자를 제거하세요.

---

## 검사했지만 문제 없는 항목

- 구분선/박스 헤더 주석(`// ====`, `// ----`, ALL CAPS): 0건.
- TODO/FIXME/HACK 주석: 0건.
- 이모지 장식 주석(`// ✅`, `// 🚀` 등): 0건.
- 단계 내레이션(`// Step 1...`), end marker(`// end of function`): 0건.
- 마케팅 버즈워드(원활한/혁신적/차세대/Seamless/Ultimate 등): 0건.
- 유저 대면 문자열의 em dash(`—`): 0건. 문자열 리터럴 내 em dash는 개발자 대상 테스트 설명 2건(`tts.test.ts:73`, `playerStatePublisher.test.ts:95`)뿐이라 유저 대면 R-02 위반이 아닙니다. 참고로 코드 주석에는 `—`가 약 60곳에서 정보 구분자로 쓰이나, 전부 비즈니스 로직·엣지케이스·워크어라운드 설명이라 antislop-code의 보존 대상이라 플래그하지 않았습니다.
- 근거 없는 숫자·스탯·보장 문구(R-17/R-36/R-38): 0건. 등장하는 수치(볼륨 0~150, TTS 200자, 투표 30초, 오류 3회)는 모두 실제 설정값·제약입니다.
- 범용 CTA(R-15), 챗봇 클로저: 0건. 안내 문구가 모두 구체적 동작(예: `/현재곡`으로 새로고침)을 가리킵니다.
- 전이 로직 주석(queueAdvancer·playbackWatchdog·customPlayer): 밀도는 높으나 α/β 이벤트 순서, 예열 소비, 파괴 타이머, 레이스 경합 등 실제 제약·회피 전략을 설명하는 보존 대상이라 플래그하지 않았습니다.
- precondition 3개 흐름 오버라이드(SameVoiceChannel 등): 사파이어 `AllFlowsPrecondition` 표준 패턴이고 공통 `check`로 로직이 공유돼 중복이 아님.
