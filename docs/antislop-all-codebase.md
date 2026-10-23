# antislop 코드베이스 전체 감사 리포트 (apps + packages 전량)

- 날짜: 2026-10-22 ~ 2026-10-23
- 브랜치: `chore/antislop-audit` (beta에서 생성)
- 방법: 읽기 전용 비동기 에이전트 20개가 앱/패키지를 나눠 동시 감사. 각 에이전트는 antislop 코어 + `antislop-code` / `antislop-copywriting` / `antislop-human` / `antislop-layoutmobile` / `antislop-ui` 스킬을 로드했고, 결과를 `docs/antislop-audit/segments/NN-*.md`에 먼저 저장한 뒤 이 문서로 병합했습니다.
- 코드/설정 수정: 0건. 에이전트가 만들 수 있는 파일은 세그먼트 리포트 1개씩뿐이었습니다.
- 우선순위 기준: Hard Gate(R-02, 03, 17, 18, 23~28, 32~38) = HIGH, Purpose-Gate(R-01, 04, 06~10, 12~14, 19, 22) = MEDIUM, Quality Locks(R-05, 11, 15, 16, 20, 21, 29, 30, 31) = LOW. 코드 주석 슬롭·중복·죽은 코드는 MEDIUM(경미하면 LOW), 테스트 누락은 LOW.

## 전체 합계

**246건 (HIGH 31 / MEDIUM 73 / LOW 142)**

### 앱/패키지별 집계

| 범위 | 세그먼트 | T | H | M | L |
|---|---|---:|---:|---:|---:|
| apps/bot | 01~04 | 46 | 3 | 13 | 30 |
| apps/dashboard | 05~09 | 72 | 12 | 24 | 36 |
| apps/data-api | 10~11 | 42 | 10 | 15 | 17 |
| apps/shardmanager | 12 | 11 | 1 | 2 | 8 |
| apps/storage | 13 | 8 | 0 | 1 | 7 |
| apps/notifier | 14 | 9 | 1 | 3 | 5 |
| packages/utils | 15~17 | 35 | 1 | 10 | 24 |
| packages/prisma | 18 | 7 | 0 | 2 | 5 |
| packages/shardclient | 19 | 11 | 3 | 2 | 6 |
| packages/app-kit | 20 | 5 | 0 | 1 | 4 |
| **합계** | 20개 | **246** | **31** | **73** | **142** |

### 세그먼트별 집계

| # | 세그먼트 | 범위 | T | H | M | L |
|---|---|---|---:|---:|---:|---:|
| 01 | bot-audio | apps/bot/src/modules/audio | 9 | 0 | 3 | 6 |
| 02 | bot-general | apps/bot/src/modules/general | 17 | 2 | 4 | 11 |
| 03 | bot-voice-games | apps/bot/src/modules/{voice,games} | 7 | 1 | 2 | 4 |
| 04 | bot-core-services | apps/bot/src/{core,services,lib,types} | 13 | 0 | 4 | 9 |
| 05 | dashboard-pages | apps/dashboard/src/app (api 제외) | 19 | 4 | 6 | 9 |
| 06 | dashboard-api | apps/dashboard/src/app/api | 10 | 0 | 2 | 8 |
| 07 | dashboard-ui-primitives | components/{ui,primitives,overlay,layout,navbar,discord,data,motion,licenses} | 16 | 3 | 6 | 7 |
| 08 | dashboard-components-feature | components/{servers,player,playlists,home} | 16 | 5 | 4 | 7 |
| 09 | dashboard-lib-hooks | src/{lib,hooks} | 11 | 0 | 6 | 5 |
| 10 | data-api-routes | data-api {routes,plugins,config} | 15 | 1 | 6 | 8 |
| 11 | data-api-services | data-api {services,providers,renderers,utils} | 27 | 9 | 9 | 9 |
| 12 | shardmanager | apps/shardmanager/src | 11 | 1 | 2 | 8 |
| 13 | storage | apps/storage/src | 8 | 0 | 1 | 7 |
| 14 | notifier | apps/notifier/src | 9 | 1 | 3 | 5 |
| 15 | utils-infra | utils 인프라 파일군 (log/redis/cache/format 등) | 14 | 0 | 4 | 10 |
| 16 | utils-audio | utils 오디오·명령어 파일군 | 7 | 0 | 2 | 5 |
| 17 | utils-domain | utils 도메인 파일군 (weather/delivery/greeting 등) | 14 | 1 | 4 | 9 |
| 18 | prisma | packages/prisma (schema + migrations) | 7 | 0 | 2 | 5 |
| 19 | shardclient | packages/shardclient | 11 | 3 | 2 | 6 |
| 20 | app-kit | packages/app-kit | 5 | 0 | 1 | 4 |

## HIGH 핵심 클러스터 (교차 요약)

1. **실측 대비 FAIL (R-25)**: data-api canvas 렌더러 8건(11), 대시보드 상태 배지/포커스 링/아바타 점 3건(07), 재생목록/챗툴스 안내 2건(08), 에러 페이지 워터마크 1.09:1(05). 모두 `contrast-check.py` 수치로 판정했고 제안 색상 PASS 수치를 병기한 세그먼트가 있습니다.
2. **유저 노출 em dash (R-02)**: 봇 `!도움말` 목록(02), 대시보드 화면 텍스트 4곳(08), data-api 유저 에러 메시지(10, 11), notifier 웹훅 표시 기본값(14), utils 대시보드 에디터 칩 설명(17).
3. **모바일/터치 (R-03)**: 44px 미만 탭 타깃 7곳(08), 20px 로그아웃 버튼(05), 가로 모드 콘텐츠 클리핑(05).
4. **키보드 (R-32)**: 플레이리스트 트랙 재정렬이 드래그 전용, 키보드·터치 폴백 부재(08).
5. **3상태 (R-27)**: `loading.tsx`/`Suspense` 부재 2개 라우트(05).
6. **정직성 (R-38)**: presence 없는 멤버를 `online`으로 단정 표시(02).

## 에이전트 간 판정 기준 불일치 (수정 단계에서 재분류 필요)

코드 주석의 em dash(U+2014) 취급이 세그먼트마다 다릅니다.

- HIGH로 플래그한 세그먼트: 03(주석 6곳), 12(주석 10곳), 19(주석 3곳) → 5개 HIGH finding.
- 참고/보존으로 제외한 세그먼트: 01, 08, 15, 18 등.

R-02는 에이전트가 작성하는 텍스트를 규율하며 기존 코드 주석은 개발자 작성 텍스트에 해당합니다. 일관되게 처리하려면 "주석 em dash"를 일괄 LOW(문자 치환)로 낮추고 유저 노출 문자열의 em dash만 HIGH로 유지하는 것이 맞습니다. 이 기준으로 재분류하면 HIGH 31 → 26, LOW 142 → 147이 됩니다. 본 문서는 세그먼트 원문을 그대로 병합했으므로 재분류는 수정 단계에서 수행합니다.

## 수정 진행 규칙

발견 목록의 번호를 승인하기 전까지 코드는 수정하지 않습니다. 승인된 번호만 수정하고, 언급되지 않은 번호는 건드리지 않습니다.

## 전달 게이트 (Delivery Gate)

- R-17/R-36/R-38 PASS: 모든 finding에 file:line 근거와 스니펫 첨부. 미검증 항목(런타임 동작, 범위 밖 소비처)은 각 세그먼트의 "미검증/한계" 섹션에 명시.
- R-35 미수행 명시: 빌드·실행·클릭 검증은 읽기 전용 감사 규칙상 수행하지 않았습니다. 판정은 코드 검사와 스크립트 계산(대비)만으로 했습니다.
- R-02 PASS: 이 문서의 작성 텍스트에는 em dash(U+2014)가 없습니다. 본문 근거 블록의 대시 표기는 전부 원문 코드 직접 인용입니다.
- 수정 0건: 병합 시점 `git status`로 신규 생성 파일이 `docs/antislop-audit/**`와 `docs/antislop-all-codebase.md`뿐임을 확인합니다.

## 세그먼트 원문 (20개 순서대로 병합)


---

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


---

TOTAL: 17 (HIGH:2 MEDIUM:4 LOW:11)

# 02. bot general 모듈 antislop 감사

- 날짜: 2026-10-22
- 브랜치: chore/antislop-audit
- 범위: `apps/bot/src/modules/general/**`
- 감사 파일 수: 68개 파일 (총 5,616줄), 커맨드 16 · 서브커맨드 3 · 리스너 30 · 인터랙션 핸들러 5 · 전제조건 2 · 유틸 6 · 테스트 6
- 검사 방법: 전체 파일 수동 검토 + 패턴 grep (em dash, R-16 버즈워드, 근거 없는 숫자/보장문, 장식 이모지 주석, 구분선/TODO/단계 내레이션 주석)

---

## Findings

### 1. [HIGH] 커스텀 명령어 목록 문자열에 em dash 사용

- 위치: `apps/bot/src/modules/general/listeners/message/customCommandPrefix.ts:154`
- 규칙: R-02 (하드 게이트, 유저에게 보이는 문자열의 em dash(U+2014) 금지)
- 사유: `!도움말` 출력 줄 사이를 em dash로 연결해 유저 화면에 하드코딩으로 노출합니다.
- 근거:

```ts
.map((command) => `\`${prefix}${command.name}\` — ${command.description || '설명 없음'}`);
```

- 제안: 콤마 또는 `·` 구분자로 교체 (예: `` `${prefix}${name}` · ${desc}` ``).

### 2. [HIGH] presence 없는 멤버의 상태를 online으로 단정 표시

- 위치: `apps/bot/src/modules/general/commands/profile.ts:285` (전달처 `profile.ts:311`)
- 규칙: R-38 (근거 없는 실제처럼 보이는 값 표시, 하드 게이트)
- 사유: 멤버 presence 데이터가 없거나 멤버 조회에 실패하면(위 `profile.ts:227-229`의 catch로 member가 null)도 프로필 카드 렌더러에 `online`을 확정값으로 넘겨, 관측하지 못한 상태를 사실처럼 보여줍니다.
- 근거:

```ts
const derivedStatus = (member?.presence?.status ?? 'online') as 'online' | 'idle' | 'dnd' | 'invisible';
// ...
status: derivedStatus,
```

- 제안: presence가 없으면 상태 표시를 생략하거나 "알 수 없음" 같은 정직한 대체값을 쓰세요.

### 3. [MEDIUM] 서버 나머지 텍스트 채널 수집 블록이 3개 파일에 동일 복제

- 위치: `apps/bot/src/modules/general/commands/tts.ts:92`, `apps/bot/src/modules/general/commands/chatTools.ts:122`, `apps/bot/src/modules/general/commands/chatSettings.ts:94`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직)
- 사유: 동일한 필터 조건이 3곳에 복사돼 있어 채널 타입 정책이 바뀌면 한쪽만 갱신됩니다.
- 근거:

```ts
// tts.ts:95 = chatTools.ts:125 동일 문자열, chatSettings.ts:97-98도 같은 조건
channel.id !== interaction.channelId && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
```

- 제안: `guildService` 쪽에 공용 헬퍼로 모으고 3곳에서 호출하세요.

### 4. [MEDIUM] 커스텀 명령어 실행 컨텍스트와 오류 안내가 접두사/슬래시 두 리스너에 중복

- 위치: `apps/bot/src/modules/general/listeners/message/customCommandPrefix.ts:82`와 `apps/bot/src/modules/general/listeners/interaction/customCommandSlash.ts:54` (오류 문자열: prefix `:110`/`:120`/`:133` vs slash `:81`/`:84`/`:87`)
- 규칙: AI 슬롭 분류 (파일 간 중복 로직)
- 사유: `member`/`guild` 어댑터 블록(`hasRole`/`addRole`/`removeRole`/`botTopRolePosition`/`botCanManageRoles`/`getRole`)과 실패 안내 문구가 사실상 동일하게 두 번 작성돼 있습니다.
- 근거:

```ts
// customCommandPrefix.ts:120 / customCommandSlash.ts:84 동일 문자열
`-# ${emoji('error')} 이 명령어를 실행할 권한이 없어요.`
```

- 제안: 컨텍스트 어댑터 빌더와 3종 오류 메시지를 공용 함수로 추출해 두 진입점이 공유하게 하세요.

### 5. [MEDIUM] 채널 턴 확보, 유저 턴 소모, 해제 게이팅이 두 진입점에 중복

- 위치: `apps/bot/src/modules/general/commands/chat.ts:102`, `apps/bot/src/modules/general/listeners/message/mentionReply.ts:61`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직)
- 사유: `acquireChannelTurn` → `tryConsumeUserTurn` → `finally releaseChannelTurn` 순서와 그 이유를 적은 주석까지 두 곳에 똑같이 복제돼, 한쪽 게이팅 규칙만 바뀌면 불변식이 깨집니다.
- 근거:

```ts
// chat.ts:102 · mentionReply.ts:61 동일 조건
if (!acquireChannelTurn(channelId)) {
```

- 제안: 게이팅과 안내 문구를 `aiChatService`의 공용 함수로 묶고, `runChatTurnToScreen`처럼 한곳에서 검증하세요.

### 6. [MEDIUM] 디버그 로그 1줄을 위한 단일 사용 허퍼 5개 체인

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts:34`
- 규칙: AI 슬롭 분류 (불필요한 래퍼, 단일 사용 허퍼 레이어)
- 사유: `getSuccessLoggerData`와 그 안의 `getShardInfo`/`getCommandInfo`/`getAuthorInfo`/`getGuildInfo`가 각각 정확히 한 번씩만 호출되는 1줄짜리 감싸기 함수로, 읽기 좋은 디버그 로그 한 줄을 5개 함수로 분해했습니다.
- 근거:

```ts
function getShardInfo(id: number) {
	return `[${cyan(id.toString())}]`;
}
```

- 제안: `logSuccessCommand` 안에 포맷팅을 직접 넣고 중간 허퍼 4개를 제거하세요.

### 7. [LOW] 이벤트가 등록되지 않아 도달할 수 없는 else 분기

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts:26`
- 규칙: AI 슬롭 분류 (도달 불가능 분기)
- 사유: 리스너는 `Events.ChatInputCommandSuccess`만 등록하는데, `payload.message` 경로를 위한 else 분기와 `ContextMenuCommandSuccessPayload`/`MessageCommandSuccessPayload` 타입이 살아남아 있습니다.
- 근거:

```ts
} else {
	successLoggerData = getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command);
}
```

- 제안: 미사용 이벤트 경로와 타입을 제거하거나 해당 이벤트 리스너를 실제로 등록하세요.

### 8. [LOW] 테스트 파일 안의 미사용 목과 no-op 문

- 위치: `apps/bot/src/modules/general/listeners/interaction/customCommandSlash.test.ts:69` (목 정의는 `:6`)
- 규칙: AI 슬롭 분류 (죽은 코드)
- 사유: hoisted된 `findMany` 목은 파일 어디서도 쓰이지 않고, `void findMany;` 문은 결과를 버리는 무의미한 실행입니다.
- 근거:

```ts
beforeEach(() => {
	vi.clearAllMocks();
	void findMany;
```

- 제안: `findMany` 목과 `void findMany;`를 함께 삭제하세요.

### 9. [LOW] ephemeral 판정 식이 두 에러 리스너에 동일 복제

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandError.ts:36`, `apps/bot/src/modules/general/listeners/interactionHandlerError.ts:34`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직, 경미)
- 사유: 140자짜리 조건식이 한 글자도 다르지 않게 두 번 작성돼 있습니다.
- 근거:

```ts
const ephemeral = typeof context === 'object' && context !== null && 'ephemeral' in context ? Boolean(context.ephemeral) : !userError;
```

- 제안: UserError의 ephemeral 판정을 공용 헬퍼로 한곳에 두세요.

### 10. [LOW] 입장/퇴장 리스너 본문 거의 전부 중복

- 위치: `apps/bot/src/modules/general/listeners/member/guildMemberAdd.ts:16`, `apps/bot/src/modules/general/listeners/member/guildMemberRemove.ts:17`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직, 경미)
- 사유: `dispatch` 호출 객체와 try/catch 구조가 같고 `'welcome'`/`'goodbye'`와 로그 문구만 다릅니다.
- 근거:

```ts
await container.memberGreetingService.dispatch(guild, 'welcome', {
	user: { id: member.id, username: member.user?.username ?? member.displayName },
```

- 제안: 공용 dispatch 헬퍼를 두고 이벤트 종류와 라벨만 넘기세요.

### 11. [LOW] 업타임을 시/일/시/분으로 분해하는 계산이 두 파일에 중복

- 위치: `apps/bot/src/modules/general/subcommands/bot.ts:27`, `apps/bot/src/modules/general/commands/development/nodes.ts:55`
- 규칙: AI 슬롭 분류 (파일 간 중복 로직, 경미)
- 사유: `uptimeSeconds`/`days`/`hours`/`minutes` 상수 4줄이 동일하게 복제돼 있습니다. 같은 모듈 `clientReady.ts:60`은 이미 `formatTime` 유틸을 씁니다.
- 근거:

```ts
const days = Math.floor(uptimeSeconds / 86400);
const hours = Math.floor((uptimeSeconds % 86400) / 3600);
const minutes = Math.floor((uptimeSeconds % 3600) / 60);
```

- 제안: 공용 시간 포맷 헬퍼로 합치세요.

### 12. [LOW] 코드를 그대로 다시 말하는 섹션 라벨 주석

- 위치: `apps/bot/src/modules/general/commands/development/shards.ts:55`
- 규칙: antislop-code 체크리스트 (빈 라벨/재서술)
- 사유: 아래 3줄(서버 수, 플레이어 수, 메모리)이 이미 말하는 내용을 영문 라벨로 한 번 더 반복합니다.
- 근거:

```ts
// Guild & memory stats
lines.push(`${emoji('house')} **서버**: ${client.guilds.cache.size}개`);
```

- 제안: 코드가 이미 말하는 라벨이므로 삭제하세요.

### 13. [LOW] 조건문을 그대로 번역한 주석

- 위치: `apps/bot/src/modules/general/listeners/guild/guildDeleted.ts:12`
- 규칙: antislop-code 체크리스트 (재서술)
- 사유: 바로 아래 `if (this.container.audio)`와 `player.destroy()`가 이미 말하는 동작을 영문으로 반복합니다.
- 근거:

```ts
// Stop and destroy audio player if it exists
if (this.container.audio) {
```

- 제안: 제거하세요. 남길 정보라면 "왜 여기서 정리하는지"만 남기면 됩니다.

### 14. [LOW] 조건문을 그대로 번역한 주석

- 위치: `apps/bot/src/modules/general/listeners/commands/message/messageDeleted.ts:17`
- 규칙: antislop-code 체크리스트 (재서술)
- 사유: `if (!this.container.audio) return;`가 이미 말하는 조건을 한 번 더 설명합니다.
- 근거:

```ts
// Ignore audio is not initialized
if (!this.container.audio) return;
```

- 제안: 제거하세요.

### 15. [LOW] 분기 조건을 그대로 반복한 주석

- 위치: `apps/bot/src/modules/general/listeners/commands/chatInputCommands/chatInputCommandError.ts:14`
- 규칙: antislop-code 체크리스트 (재서술)
- 사유: `if (!userError)`가 이미 말하는 분류를 영문으로 한 번 더 적었습니다.
- 근거:

```ts
// send actual error to sentry
if (!userError) {
```

- 제안: 제거하거나, UserError를 제외하는 이유(의도된 안내라 오류로 세지 않는다)만 남기세요.

### 16. [LOW] 블록 동작을 반복만 하는 라벨 주석

- 위치: `apps/bot/src/modules/general/listeners/interactionHandlerError.ts:30`
- 규칙: antislop-code 체크리스트 (빈 라벨)
- 사유: 아래 try/블록이 "에러 메시지를 보낸다"는 사실 외에 새로 주는 정보가 없습니다.
- 근거:

```ts
// 사용자에게 에러 메시지 전달
if (interaction.isRepliable()) {
```

- 제안: 삭제하세요. 대신 ephemeral 판정과 followUp 분기 같은 실제 규칙 위 주석으로 대체할 수 있습니다.

### 17. [LOW] 핵심 순수 함수에 테스트 없음 (참고용)

- 위치: `apps/bot/src/modules/general/utils/chatView.ts:17` (미테스트: `embedFix.ts`, `profile.ts`, `help.ts`의 분할/타이핑 로직 포함)
- 규칙: AI 슬롭 분류 (테스트 누락, 참고용 LOW)
- 사유: 68개 파일 중 테스트는 6개뿐이고, 코드블록/줄 경계를 보존하며 글을 자르는 `splitTextForDisplay` 같은 경계 조건 많은 순수 함수가 검증되지 않습니다.
- 근거:

```ts
function splitTextForDisplay(text: string): string[] {
	if (text.length <= FINAL_SEGMENT_LIMIT) return [text];
```

- 제안: 4000자 근처 경계, 코드펜스 중간, 4청크 초과 잘림 케이스를 먼저 추가하세요.

---

## 검사했지만 문제 없는 항목

- R-02 em dash: 범위 전체 grep 결과 유저 대상 문자열에서는 1건(1번)만 발견. 나머지 사용은 모두 한국어 코드 주석이라 해당 규칙 대상 아님.
- R-16 버즈워드(원활한/혁신적/차세대/Seamless/Ultimate/강력한/획기적 등): 유저 문자열 0건. `속도`는 TTS 기능 용어로 사용 적절.
- R-15 범용 CTA: `초대하기`, `/재생으로 첫 곡을 신청해 보세요`, `대시보드에서 만들 수 있어요` 등 모두 구체적 행동 지시.
- R-17/R-36 근거 없는 숫자: 날씨는 `Open-Meteo 기준`(weather.ts:70), 택배는 `tracker.delivery 기준`(delivery.ts:33), 청취 시간은 `(최근 500건 기준)`(profile.ts:393)으로 출처·샘플 한계를 명시. 가짜 통계·보장 문구(무제한, 100%, 절대 보장) 0건.
- R-18 후기 섹션: 해당 없음. 유령 인물, 가짜 출처 0건.
- 챗봇 클로저(도움이 되셨나요, 궁금한 점은 말씀하세요 등): 0건.
- antislop-code 구분선/ALL CAPS 박스 헤더, 단계 내레이션(Step 1), 빈 라벨(TODO/FIXME/HACK), 시그니처 반복 JSDoc, 주석용 장식 이모지(✅/🚀): 0건. (`clientReady.ts:124`의 🚀는 코드 주석이 아닌 콘솔 시작 배너 문자열.)
- 파일 헤더 주석(embedFix, countingChannel, customCommandPrefix, messageQuote, ttsView 등): 프로토콜 계약, 권한·보안 규칙(비공개 채널 인용 금지), 레이스 방지, 워크어라운드를 설명하는 보존 대상으로 판단해 플래그하지 않음.
- R-26 죽은 컨트롤: `chatcancel:`, `tts:panel:*`, `tts:modal:*`, `eval-modal` 커스텀 ID와 `원문 보기`/`초대하기` 링크 버튼 전부 해당 핸들러가 처리됨.
- 미사용 export/imports: 범위 내 export(`sendComponent`, `INFO_SUBCOMMANDS`, `runChatTurnToScreen`, `buildTtsPanel` 등) 전부 호출처 확인. 잘못된 레이어 import나 모듈 경계 위반은 확인되지 않음.
- R-03 모바일 레이아웃, R-25 대비비, R-32 키보드 접근: Discord 메시지 렌더링이라 해당 없음(웹 UI 규칙).
- 테스트 품질: 존재하는 6개 테스트는 레이스/직렬화, 커스텀 Id 계약, ephemeral 분기, 경계값을 실제처럼 검증해 상태였음.


---

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


---

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


---

TOTAL: 19 (HIGH:4 MEDIUM:6 LOW:9)

# 세그먼트 05: 대시보드 페이지·레이아웃 (apps/dashboard/src/app)

- 날짜: 2026-10-22
- 브랜치: chore/antislop-audit
- 범위: `apps/dashboard/src/app/**` 중 `app/api/**` 제외 (페이지, 레이아웃, 페이지 컴포넌트, 루트 `globals.css`)
- 감사 파일 수: 36개 (tsx 35 + globals.css 1, 범위 내 파일 전량)
- 방법: 스킬 6종(antislop, antislop-code, antislop-copywriting, antislop-human, antislop-layoutmobile, antislop-ui) 로드 후 코드 정독, `grep`으로 em dash·buzzword·고정 폭·포커스 제거 전수 검색, R-25 대비는 `python3 contrast-check.py`로 계산. 브라우저 실행·빌드·테스트는 수행하지 않아 렌더링 추정치는 근거란에 따로 표기했습니다.
- 우선순위: 지정된 등급 매핑(Hard Gate = HIGH, Purpose-Gate = MEDIUM, Quality Locks = LOW)을 따르되, 규칙 적용 자체가 추정에 의존한 건은 해당 사유란에 그 이유를 남겼습니다.

## Findings

### 1. [HIGH] 기여자·플레이어 페이지에 로딩 상태가 없다
- 위치: `apps/dashboard/src/app/contributors/page.tsx:42` (같은 형질: `apps/dashboard/src/app/player/[id]/page.tsx:15`)
- 규칙: R-27 (3상태)
- 사유: GitHub 최대 10페이지 순차 조회와 Discord 멤버십 확인처럼 네트워크 왕복이 필요한 서버 컴포넌트 페이지인데 `loading.tsx`도 `Suspense`도 없다. 형제 라우트(`playlists`, `profile`, `servers/[id]`)는 모두 `loading.tsx`를 보유해 경로 간 일관성도 깨진다. 캐시 미스 첫 방문에서는 안내 없이 빈 화면이 이어진다.
- 근거:
```tsx
export default async function ContributorsPage() {
  let contributors: Contributor[] = [];
  let failed = false;
```
  (`error`는 `failed` 플래그로, 빈 목록은 `EmptyState`로 처리하지만 로딩 화면은 어디에도 없다.)
- 제안: `contributors/loading.tsx`와 `player/[id]/loading.tsx`를 추가하거나 페이지 내 `Suspense` 폴백을 두고, 스켈레톤에 `aria-busy`/`sr-only` 안내를 넣어 기존 로딩 패턴과 맞춘다.

### 2. [HIGH] 로그인 오류 페이지 배경 워터마크 "ERROR" 대비가 1.09:1이다
- 위치: `apps/dashboard/src/app/error/page.tsx:31`
- 규칙: R-25 (대비)
- 사유: `text-foreground/5`는 라이트 합성 `#f5efef` on `#fff9f9`, 다크 합성 `#2a2121` on `#1f1618`이 되는데 스크립트 결과 양쪽 모두 normal(4.5:1)·large(3.0:1) FAIL이다. `select-none`만 있고 `aria-hidden`이 없어 스크린리더에도 "ERROR" 텍스트로 읽힌다.
- 근거:
```tsx
<span className="select-none whitespace-nowrap text-[10rem] font-black tracking-tighter text-foreground/5 sm:text-[16rem] md:text-[22rem]">
  ERROR
</span>
```
  `contrast-check.py "#f5efef" "#fff9f9"` → 1.09:1 FAIL, `contrast-check.py "#2a2121" "#1f1618"` → 1.13:1 FAIL
- 제안: 순수 장식으로 분리(`aria-hidden` 추가)하되 최소한 눈에 견딜 수준(3:1 근처)으로 불투명도를 올리거나, 장식 목적이라면 텍스트 대신 CSS 배경 요소로 바꿔 대비 기준 논쟁에서 제외한다.

### 3. [HIGH] 초대 페이지가 고정 뷰포트 높이 + overflow-hidden이라 짧은 화면에서 잘린다
- 위치: `apps/dashboard/src/app/invite/page.tsx:28`
- 규칙: R-03 (모바일)
- 사유: 다른 단일 초점 페이지가 `min-h-[calc(100svh-var(--navbar-h))]`를 쓰는 것과 달리 이 페이지만 `h-[100svh]` 고정에 `overflow-hidden`이다. 콘텐츠 세로 합은 약 410px 수준이라 가로 모드(뷰포트 높이 375px 이하)에서 상하가 잘리고, 네비게이션(4rem)이 흐름을 차지하므로 세로로는 본문이 뷰포트보다 길어진다.
- 근거:
```tsx
<main className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
```
- 제안: 높이를 콘텐츠 기준 `min-h`로 바꾸고, 정말 전체 화면이 필요하면 `dvh` 단위와 `overflow: clip` 대신 콘텐츠 재흐름으로 해결한다.

### 4. [HIGH] 로그아웃 인라인 버튼의 탭 타깃이 약 20px로 44px에 못 미친다
- 위치: `apps/dashboard/src/app/servers/page.tsx:54`
- 규칙: R-03 (탭 타깃)
- 사유: `text-sm` 버튼이 `text-xs` 문장 안에 패딩·최소 높이 없이 들어가 눈높이 약 20px에 그친다. 모바일 엄지로 빠져나가기 어렵고 호버 없이 눌러야 하는 동작이라 터치에서 더 불리하다. (WCAG 2.5.8은 본문 내 인라인 요소 예외를 두지만 antislop 스킬의 44px 기준에는 예외가 없다.)
- 근거:
```tsx
<p className="text-xs font-medium text-muted-foreground">내 계정이 아닌가요? <button onClick={() => signOut()} className="text-primary-text hover:underline cursor-pointer">로그아웃</button></p>
```
- 제안: `min-h-11` 같은 최소 높이와 여백을 주거나, 문장 밖의 독립 버튼으로 분리한다.

### 5. [MEDIUM] 재생 순위 페이지의 통계 박스가 도움 커서만 보여주고 툴팁이 없다
- 위치: `apps/dashboard/src/app/track/page.tsx:69` (동일 구조 `apps/dashboard/src/app/track/page.tsx:80`)
- 규칙: R-26 (행동 없는 affordance)
- 사유: `cursor-help`와 `group relative`가 툴팁이 있다는 신호를 주는데 파일 안에 툴팁 요소도 `title`도 없다. 마우스를 올린 사용자는 설명을 기다리게 되고, 정작 필요한 보조 설명("단일 곡 수"와 "검색 결과 수"의 차이)은 어디에도 없다. (div라서 버튼·링크라는 R-26 대상 컨트롤은 아니어서 HIGH 대신 MEDIUM으로 분류.)
- 근거:
```tsx
<div className="group relative bg-surface-1 rounded-card h-full px-3 sm:px-6 flex flex-col justify-center items-center transition-colors cursor-help flex-1 sm:flex-none sm:min-w-[140px]">
```
- 제안: 실제 툴팁(설명 문구)을 붙이거나 `cursor-help`와 `group` 속성을 제거한다.

### 6. [MEDIUM] 404 페이지의 아이콘 낙하 조작은 마우스 전용이다
- 위치: `apps/dashboard/src/app/not-found.tsx:93`
- 규칙: R-32 (키보드 접근성)
- 사유: `outline-none`에는 교체용 `focus-visible:ring-2`가 있어 포커스 제거 단독 위반은 아니지만, 같은 버튼이 `aria-hidden` + `tabIndex={-1}`이라 포커스 링이 애초에 표시되지 않고 키보드로 낙하 조작을 할 수 없다. 완료 시에만 나타나는 "홈으로 가기"도 키보드로는 만들 수 없다. 페이지 주요 기능(뒤로 가기, 네비게이션의 홈 링크)은 살아 있고 장식성 이스터에그라 규칙 등급(HIGH) 대신 경중을 감안해 MEDIUM으로 분류한다.
- 근거:
```tsx
className={`pointer-events-auto flex h-full w-full cursor-pointer items-center justify-center border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${icon.tone}`}
aria-hidden
tabIndex={-1}
```
- 제안: 낙하 버튼에 키보드 조작 경로(포커스 가능 + Enter/Space)를 남기거나, 명확히 장식이라면 클릭 조작 자체를 없애고 안내 문구에서 "건드려보라"는 유도를 뺀다.

### 7. [MEDIUM] 단일 초점 페이지 4곳이 같은 JSX 구조를 복제한다
- 위치: `apps/dashboard/src/app/invite/redirect/page.tsx:16` (동일: `not-found.tsx:63`, `login/page.tsx:38`, `invite/page.tsx:32`)
- 규칙: AI 코드 슬롭 (중복)
- 사유: 중앙 정렬 `main` 래퍼(`min-h-[calc(100svh-var(--navbar-h))] ... px-4 sm:px-6 lg:px-8`)가 4곳에서 완전 동일하고, 배경 블러 오브(`h-[32rem] w-[32rem] ... blur-3xl`)도 4곳에 그대로 복사돼 있다. R-01 근거 주석이 달린 곳과 없는 곳이 섞여 근거 기록도 불균일하다.
- 근거:
```tsx
<div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
  <div className="h-[32rem] w-[32rem] rounded-full bg-primary/[0.04] blur-3xl" />
</div>
```
- 제안: `<FocusPageShell>` 같은 공용 래퍼로 합치고, R-01 목적 문구를 래퍼 주석 한 곳에 모은다.

### 8. [MEDIUM] globals.css에 등호 구분선 섹션 배너 주석이 10곳 있다
- 위치: `apps/dashboard/src/app/globals.css:1`
- 규칙: 주석 슬롭 (Decorative Separators)
- 사유: `=` 반복으로 감싼 ALL CAPS 섹션 번호 배너가 1, 10, 28, 106, 148, 161, 200, 243, 307, 504행에 있다. 장식이 메시지를 대신하는 antislop-code의 전형 패턴이고, 같은 파일의 "왜" 주석(대비 근거, 다크 그림자 이유 등)과 대비된다.
- 근거:
```
/* =============================================================================
   1. Tailwind & shadcn/ui integration
   ============================================================================= */
```
- 제안: 배너를 평문 한 줄(`// Tailwind와 shadcn/ui 연결`)로 바꾸고 번호 매김을 없앤다. 대비·성능·엣지케이스를 설명하는 인라인 주석은 그대로 둔다.

### 9. [MEDIUM] 디자인 갤러리 목차의 Primitives 아이콘이 섹션 내용과 무관하다
- 위치: `apps/dashboard/src/app/design/page.tsx:22`
- 규칙: R-04 (아이콘)
- 사유: Palette(팔레트), Tags(토큰), Layers(표면), Table2(데이터)처럼 나머지는 섹션 의미를 따르는데 "Primitives(기본 UI 컴포넌트)"에만 섹션 성격과 무관한 번개(Zap) 아이콘이 붙었고 관련성 근거도 없다.
- 근거:
```tsx
{ id: "primitives", label: "Primitives", icon: <Zap size={14} /> },
```
- 제안: 해당 섹션 의미를 나타내는 아이콘으로 바꾸거나, 목차에서 아이콘 없이 텍스트만 쓴다.

### 10. [MEDIUM] 샤드 페이지 섹션 제목의 `whitespace-nowrap`이 좁은 폭에서 잘림 위험을 만든다
- 위치: `apps/dashboard/src/app/shards/page.tsx:71`
- 규칙: R-03 (가로 overflow)
- 사유: 제목 + 카운트가 줄바꿈 금지인데 좌측 구분선(48px)과 `gap-6`(48px)까지 더하면 최소 폭이 약 370px 수준이다. 360px 안팎 기기에서는 `flex-1` 구분선이 0으로 줄어든 뒤에도 남아 본문이 넘치고 레이아웃 래퍼의 `overflow-x-clip`에 의해 우측 카운트가 잘릴 가능성이 있다. 폭 추정치만으로 판단했고 브라우저 검증은 하지 않았다.
- 근거:
```tsx
<h2 className="text-3xl font-black tracking-tighter text-foreground whitespace-nowrap">
  연동된 프로세스 <span className="text-primary-text ml-1">({processes.length})</span>
```
- 제안: `whitespace-nowrap`을 제거해 제목과 카운트가 두 줄로 흐르게 하거나, 카운트를 다음 줄/별도 요소로 뺀다.

### 11. [LOW] 디자인 갤러리에 클릭해도 결과가 없는 컨트롤이 있다
- 위치: `apps/dashboard/src/app/design/_sections/primitives-section.tsx:147` (추가: `overlay-section.tsx:133`, `overlay-section.tsx:156`, `primitives-section.tsx:240`)
- 규칙: R-26 (죽은 컨트롤)
- 사유: `dismissible` 배지의 닫기 버튼, 고정 `value`에 no-op `onChange`를 건 슬라이더 2개, `onClick={() => {}}` 드롭다운 항목 3개가 눌러도 화면이 바뀌지 않는다. 쇼케이스라는 목적이 있어 LOW이지만, 닫기·드래그처럼 "결과가 있어야 하는" 조작부터 꺼진 상태라 사용자에게 고장처럼 보인다.
- 근거:
```tsx
<Badge variant="primary" dismissible onDismiss={() => {}}>
  dismissible
</Badge>
```
- 제안: 데모 동작(배지 제거, 슬라이더 값 반영)을 실제로 붙이거나, 동작을 못 시뮬레이션하면 비활성 표시(`disabled`)로 바꿔 의도를 드러낸다.

### 12. [LOW] 초대 페이지 카피에 근거 없는 최상급 표현이 있다
- 위치: `apps/dashboard/src/app/invite/page.tsx:55`
- 규칙: R-16 (과장 수사)
- 사유: "최고의 음악 경험"은 비교 대상도 근거도 없는 최상급 주장이다. 기능을 말하는 구체 문장으로 대체하면 설득력도 잃지 않는다.
- 근거:
```
최고의 음악 경험을 전하는 시루를 초대해보세요.
```
- 제안: 실제 강점(예: 신청·대기열·웹 컨트롤)을 구체적으로 말하는 문장으로 바꾼다.

### 13. [LOW] 404 페이지 완료 상태에 장식 이모지가 들어간다
- 위치: `apps/dashboard/src/app/not-found.tsx:116`
- 규칙: 카피 점검 체크리스트 (헤딩·본문 장식 이모지), R-04
- 사유: 아이콘을 모두 떨어뜨렸을 때 표시되는 이모지로 상태 표시 역할은 하지만, 같은 자리의 텍스트("전부 떨어뜨렸네요!")가 이미 완료를 말해 이모지는 정보를 더하지 않는다.
- 근거:
```tsx
className="text-3xl sm:text-4xl"
>
  🎉
```
- 제안: 완료 아이콘(예: 체크 아이콘)으로 바꾸거나 텍스트만 남긴다.

### 14. [LOW] 초대 페이지 카운트 칩이 고정 200px 폭이다
- 위치: `apps/dashboard/src/app/invite/page.tsx:46`
- 규칙: R-03 (고정 폭)
- 사유: 동적 문구("5초 뒤에 자동으로 이동할게요...")를 넣으면서 `w-[200px]`를 박았다. 좁은 폭에서 두 줄로 접힐 뿐 가로 overflow로 이어지지는 않지만, 폭이 콘텐츠가 아니라 숫자 하나에 의해 결정된다.
- 근거:
```tsx
<div className="inline-flex items-center gap-2 rounded-control bg-surface-1 px-3 py-1 text-xs font-bold text-muted-foreground w-[200px] justify-center tabular-nums">
```
- 제안: `min-w`와 `max-w`로 범위를 주고 내용에 따라 폭이 늘어나게 한다.

### 15. [LOW] JSX 주석이 바로 아래 코드를 다시 말하는 데 그친다
- 위치: `apps/dashboard/src/app/invite/redirect/page.tsx:22` (추가: `login/page.tsx:37`, `invite/redirect/page.tsx:15`)
- 규칙: 주석 슬롭 (Restating the Obvious)
- 사유: 체크 아이콘 위의 `Success Symbol`, 블러 오브 위의 `배경 블러`는 코드가 이미 말하는 내용을 반복한다. 같은 모양의 `not-found.tsx:62` 주석은 R-01 목적까지 적어 정보량이 달라 대비가 크다.
- 근거:
```
{/* Success Symbol */}
```
- 제안: 왜(목적·대비·성능)가 없으면 주석을 지우고, 있다면 `not-found.tsx:62` 수준의 한 줄 근거로 통일한다.

### 16. [LOW] 디자인 갤러리 본문이 한 페이지 안에서 영문과 한국어를 섞는다
- 위치: `apps/dashboard/src/app/design/_sections/foundation-section.tsx:13`
- 규칙: 카피 점검 체크리스트 (영문/한국어)
- 사유: 섹션 설명·다른 본문은 한국어인데 이 문단만 전 영문이다. 개발자용 갤러리라 우선순위는 낮지만 같은 페이지 안에서 언어가 한 곳만 뒤바뀐다.
- 근거:
```
SiruBOT Dashboard uses Tailwind v4 + shadcn registry CSS integration. UI components are customized in{" "}
```
- 제안: 페이지 언어(한국어)에 맞춰 번역하거나, 용어가 섞이면 코드 경로와 같은 인용 대상만 영문으로 남긴다.

### 17. [LOW] 빈 문자열만 넘긴 죽은 속성이 있다
- 위치: `apps/dashboard/src/app/shards/page.tsx:82`
- 규칙: AI 코드 슬롭 (죽은 코드)
- 사유: `EmptyState`에 `className=""`을 넘겨 아무 효과도 내지 않는다. 기본값과 동일한 값이라 제거해도 동작이 변하지 않는다.
- 근거:
```tsx
description="샤드 매니저로부터의 생존 신호를 기다리고 있어요."
className=""
```
- 제안: 속성을 제거한다.

### 18. [LOW] 디자인 페이지의 목차 ref는 쓰기만 하고 읽지 않는다
- 위치: `apps/dashboard/src/app/design/page.tsx:59`
- 규칙: AI 코드 슬롭 (죽은 코드)
- 사유: `tocRefs`에 앵커 요소를 저장(116~118행)하지만 파일 어디에서도 읽는 곳이 없다. 스크롤 위치 맞추기가 원래 의도였다면 미완이고, 아니면 완전 죽은 상태다.
- 근거:
```tsx
const tocRefs = useRef<(HTMLAnchorElement | null)[]>([]);
```
- 제안: 목차 클릭 시 해당 항목으로 스크롤하는 데 실제로 쓰거나 ref 전체를 없앤다.

### 19. [LOW] 프로필 게임 전적 없을 때 빈 상태가 "-" 하나뿐이다
- 위치: `apps/dashboard/src/app/profile/profile-view.tsx:170`
- 규칙: R-27 (빈 상태의 원인·다음 행동)
- 사유: 가위바위보·숫자맞히기 기록이 전혀 없으면 카드 내용이 "-"로만 끝난다. 운세 카드는 같은 경우에 등록 커맨드를 안내해 다음 행동을 알려주는 것과 대비된다.
- 근거:
```tsx
) : (
  <p className="text-sm text-muted-foreground">-</p>
```
- 제안: "아직 게임 기록이 없어요. 디스코드에서 가위바위보로 시작해보세요."처럼 원인과 다음 행동을 한 줄 넣는다.

## 검사했지만 문제 없는 항목

- R-02 (em dash): 페이지 카피에서 0건. U+2014 문자 검색 결과 23건은 전부 코드 주석(`//`, `/* */`, `{/* */}`)이며 카피가 아니다. ` – `, ` -- `도 0건.
- R-15 (범용 CTA): 0건. 확인된 버튼·링크 문구는 디스코드로 계속하기, 지금 초대하기, 설정하러 가기, 다시 로그인하기, 시루봇 초대하기, 다시 시도, 서버 설정으로 돌아가기, 홈으로 가기 모두 구체 동작을 가리킨다.
- R-16 (buzzword): 원활한/혁신적인/차세대/Seamless/Ultimate 등 0건 (최상급 표현 1건은 12번으로 별도 보고).
- R-17/R-36/R-38 (숫자·보장·필러): 페이지의 모든 수치가 실제 소스다 (GitHub 기여자 API `contributors/page.tsx:29`, 재생 통계 `track/page.tsx:25`, 샤드 매니저 응답 `shards/page.tsx:19`, DB 프로필 통계 `profile/page.tsx:18`). `design/_sections/data-section.tsx:21`의 데모 수치(1234, +12%, 99.9%)는 "이 값들은 실제 측정이 아닌 컴포넌트 데모예요" 배지로 명시돼 있어 R-38 준수. John Doe, johndoe@example.com 등 필러 0건.
- R-18/R-28 (후기·FAQ): 후기, 로고 바, FAQ 섹션 자체가 없다.
- 챗봇 클로저: 0건. 안내 문구는 모두 다음 행동(다시 시도, 재로그인, 커맨드 등록)을 지시한다.
- 헤딩 장식 이모지: 헤딩에 붙은 이모지 0건 (본문 내 상태 이모지 1건은 13번으로 보고).
- R-27 (SWR 3상태): `track`(로딩 스피너·ErrorPanel·EmptyState), `servers`(스켈레톤·ErrorPanel·EmptyState+초대 CTA), `shards`(전체 로더·라우트 에러·EmptyState), 플레이어 통계(`StatsSkeleton`·재시도 EmptyState·목록/탭별 빈 상태) 모두 3상태 구비. 에러 경계는 루트 `error.tsx`, `playlists/error.tsx`, `servers/[id]/error.tsx` 3곳.
- R-32 (포커스 제거): 범위 파일의 `outline-none`은 6번 지목 1곳뿐이고 교체 링이 있다. `globals.css`에 아웃라인 제거 규칙 없음. `player-client.tsx:92`는 `focus-visible:outline-*`을 명시한다.
- R-25 (계산한 페어만): 라이트 `#7d686d` on `#ffffff` 5.16:1 PASS, on `#fff9f9` 4.95:1 PASS. 다크 `#b9a4a9` on `#2b2023` 6.71:1 PASS, on `#1f1618` 7.54:1 PASS. 경고 텍스트 라이트 `#9a6100` on `#faf1ed` 4.62:1 PASS, 다크 `#fbbf24` on `#2a1e19` 9.69:1 PASS (전부 contrast-check.py). 계산하지 않은 페어는 합격을 주장하지 않는다.
- R-03 (그리드·터치): 서버 목록 `grid-cols-[repeat(auto-fit,minmax(...))]`, 기여자 2→3→4열, 프로필 `md:grid-cols-2`/`sm:grid-cols-3` 모두 좁은 폭에서 축소·적층된다. `player-client.tsx:92`의 재생 버튼은 `pointer-coarse:min-h-11 min-w-11`로 터치에서 44px를 확보한다.
- 모션·감소 모션: `not-found.tsx:50`에서 `prefers-reduced-motion`을 읽어 낙하 애니메이션을 우회하고, `globals.css:578` 전역 규칙도 페르소나 reduced-motion을 처리한다. 범위 파일에 사용자 트리거 없는 무한 루프 애니메이션은 없다.
- R-21/R-34 (테마): `design/page.tsx:28`의 테마 토글은 `mounted` 가드 후 실제 `setTheme`을 호출한다(라이트/다크 모두 동작 코드 존재).
- R-09 (H1 위 eyebrow pill): 범위 내 페이지 어디에도 H1 위 배지가 없다. 출석 배지(`profile-view.tsx:89`)는 실제 상태 표시라 기능성 배지에 해당한다.
- R-24 (죽은 내비): 디자인 페이지 목차 앵커 7개는 `SectionHeader`의 실제 `id`와 일치하고, 페이지 간 링크(`/`, `/servers`, `/login`, `/track`, `/servers/[id]`)는 모두 존재하는 라우트다.
- R-04 (Lucide 여부): 아이콘 라이브러리가 lucide인 것은 `foundation-section.tsx:24`의 shadcn 설정(`iconLibrary: "lucide"`)으로 문서화된 설계 시스템 결정이라 기본값 무목적 선택으로 보지 않았다. 404의 `Sparkles`(`not-found.tsx:24`)와 프로필 운세 `Sparkles`(`profile-view.tsx:103`)는 각각 봇 AI 기능·별자리 운세를 대표해 관련성이 있다고 판단했다.
- 보존할 "왜" 주석 다수: 오픈 리다이렉트 방지(`login/page.tsx:25`), 좀비 세션 무한 루프 방지(`login/page.tsx:17`), 429를 404로 위장하지 않는 이유(`servers/[id]/page.tsx:47`), 스켈레톤이 실제 화면과 같은 구조여야 하는 이유(`servers/[id]/loading.tsx:5`), 토큰별 명시적 맵 사유(`tokens-section.tsx:28`), 컨트롤 경계선 대비 근거(`globals.css:205`). 이 주석들은 antislop-code의 보존 대상이라 손대지 않는다.
- 범위 밖 미검토: `components/**`(홈 섹션, 네비, PageHeader, EmptyState 등), `app/api/**`, `hooks`/`lib`는 읽지 않았다. 홈 페이지(`page.tsx`)는 섹션 조립만 범위에 들어와 히어로·기능 섹션의 카피·레이아웃은 이번 세그먼트 판단 대상이 아니다.


---

TOTAL: 10 (HIGH:0 MEDIUM:2 LOW:8)

# 세그먼트 06: 대시보드 API 라우트 (apps/dashboard/src/app/api)

- 감사일: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 46개 route.ts (api 디렉터리 전체)
- 감사 방식: read-only. 46개 파일 전량 열람 + em dash/이모지/TODO/구분선/빈 라벨/엔드 마커/미사용 export/폴백 패턴/테스트 참조 전수 grep 검증.

## Findings

### 1. [MEDIUM] data-api 실패 응답 폴백 로직이 라우트마다 수작업 복제된다

- 위치: apps/dashboard/src/app/api/servers/[id]/channels/route.ts:33 (동일 패턴 14곳)
- 규칙: ai-slop-cleaner 체크리스트 3 (라우트 간 copy-paste 로직, 인증/검증/응답 헬퍼 중복)
- 사유: `result.message ?? FALLBACK` + `result.message ? result.status : 502` 응답 조립이 channels·roles·social 4파일·chzzk 2파일·youtube/twitch resolve·playlists/search 등 14곳에 복제돼 있고, 같은 레이어에 이미 테스트까지 있는 `dataApiFailResponse`(lib/data-api/client.ts:179, greeting preview/test 2라우트가 사용) 헬퍼가 있는데도 쓰지 않는다.
- 근거:

```ts
{ error: result.message ?? CHANNELS_FALLBACK },
{ status: result.message ? result.status : 502 },
```

- 제안: 502 폴백 wrap이 헬퍼와 동일한 14곳을 `dataApiFailResponse(result, FALLBACK)` 호출로 교체해 응답 계약을 한 곳으로 모읍니다.

### 2. [MEDIUM] bot-profile 아바타/배너 검증 블록이 복제되고 한도가 하드코딩된다

- 위치: apps/dashboard/src/app/api/servers/[id]/bot-profile/route.ts:63 (배너 동일 블록 :80)
- 규칙: ai-slop-cleaner 체크리스트 3 (copy-paste 로직)
- 사유: 크기 검증, MIME 검증, base64 data URI 변환, 리셋 플래그 처리가 필드명만 다르고 14줄짜리 블록으로 두 번 반복되며, 에러 메시지의 "최대 3MB"가 상수 MAX_AVATAR_BYTES(:9) 대신 문자열로 두 번 하드코딩돼 상수 변경 시 메시지가 어긋납니다.
- 근거:

```ts
if (avatarFile.size > MAX_AVATAR_BYTES) {
  return NextResponse.json({ error: "이미지가 너무 커요. 최대 3MB까지 올릴 수 있어요." }, { status: 400 });
}
```

- 제안: `(file, field)`을 받는 로컬 헬퍼로 두 블록을 합치고, 메시지의 용량은 `Math.floor(MAX_AVATAR_BYTES / 1024 / 1024)`로 유도합니다 (assets/route.ts:77의 선례).

### 3. [LOW] 500 응답 본문의 영문 메시지가 전역 한국어 톤과 어긋난다

- 위치: apps/dashboard/src/app/api/tracks/route.ts:83, shards/route.ts:15·20, voice-servers/route.ts:15·19, data-api/route.ts:16·21, voice-servers/history/route.ts:24·28, servers/route.ts:74
- 규칙: 감사 기준 1 (유저 대상 응답/에러 메시지 copy 일관성, Quality Lock)
- 사유: 같은 앱의 나머지 오류 본문은 "~해요" 한국어 안내인데, 이 6개 파일의 실패 응답만 "Failed to fetch"/"Internal Server Error"/"Internal server error" 영문 원문 그대로 내려가 사용자에게 보이는 문구 톤이 끊깁니다.
- 근거:

```ts
{ error: "Failed to fetch tracks" },
```

- 제안: admin 대상이라도 한국어 안내("요청을 처리하지 못했어요." 등)로 통일합니다.

### 4. [LOW] 유튜브 메타데이터 폴백값 "Unknown Title"/"Unknown Artist"가 영문 그대로 노출된다

- 위치: apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:93
- 규칙: 감사 기준 1 (R-38 인접, 표시 문구 일관성)
- 사유: noembed 실패 시 한국어 UI에 "Unknown Title", "Unknown Artist"가 곡 제목·아티스트로 저장되어 그대로 표시됩니다. 정직한 폴백은 맞지만 언어만 어긋나는 값입니다.
- 근거:

```ts
let title = "Unknown Title";
let artist = "Unknown Artist";
```

- 제안: "제목 없음"/"아티스트 없음" 등 한국어 폴백값으로 바꿉니다.

### 5. [LOW] reorder 라우트에 단계 내레이션과 재서술 주석이 섞여 있다

- 위치: apps/dashboard/src/app/api/playlists/[id]/reorder/route.ts:56, 82, 111
- 규칙: antislop-code (Workflow Narration, Restating the Obvious)
- 사유: `// Fetch target track to move`, `// Run reordering inside a transaction`, `// 3. Move target track to destinationIndex`는 아래 코드가 이미 말하는 내용의 반복입니다. 다만 :84의 "-1 회피" 제약과 :92·:101의 시프트 범위 예시는 유일한 알고리즘 설명이라 보존해야 합니다.
- 근거:

```ts
// Run reordering inside a transaction
await db.$transaction(async (tx) => {
```

- 제안: 재서술 3줄과 번호 내레이션만 삭제하고 시프트 범위·-1 제약 주석은 남깁니다.

### 6. [LOW] 플레이리스트 트랙 라우트에 라인별 재서술 주석이 반복된다

- 위치: apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:92, 120, 162, 170, 230
- 규칙: antislop-code (Restating the Obvious, Line-by-Line Narration)
- 사유: `// Fetch metadata from noembed`, `// Upsert Track record`, `// Get current max position`, `// Create PlaylistTrack record`, `// Find the specific PlaylistTrack by position`은 바로 아래 코드가 이미 명시하는 동작을 다시 적습니다. 반면 :32의 "소유·개수 상한 검증이 본문 파싱보다 먼저예요"는 순서 제약을 알려주는 보존 가치 있는 주석입니다.
- 근거:

```ts
// Get current max position
const maxPositionResult = await db.playlistTrack.aggregate({
```

- 제안: 재서술 주석 5줄만 삭제하고 계약·제약 설명 주석은 유지합니다.

### 7. [LOW] stats 라우트의 "safe" 파싱 설명이 JSDoc과 인라인 주석에 중복된다

- 위치: apps/dashboard/src/app/api/servers/[id]/stats/route.ts:92
- 규칙: antislop-code (Restating the Obvious, 동일 정보 중복)
- 사유: :10-14 JSDoc이 "safe는 zod에서 파싱할 수 없어 사전에 분기하고 나머지는 coerce"를 설명한 뒤, 같은 내용을 :92 인라인 주석이 한 번 더 반복합니다.
- 근거:

```ts
// "safe"(전체 기간)는 스키마 밖에서 먼저 걸러요 — 나머지는 coerce 검증.
let days: number | "safe";
```

- 제안: 인라인 주석을 삭제하고 JSDoc 한 곳에 모읍니다.

### 8. [LOW] zod 스키마가 라우트 간에 동일 정의로 복제된다

- 위치: apps/dashboard/src/app/api/playlists/route.ts:14-29 = apps/dashboard/src/app/api/playlists/[id]/route.ts:13-28, apps/dashboard/src/app/api/playlists/search/route.ts:9 = apps/dashboard/src/app/api/servers/[id]/player/search/route.ts:13-15
- 규칙: ai-slop-cleaner 체크리스트 3 (zod 스키마 중복 정의)
- 사유: 플레이리스트 name/description 검증(길이·메시지 포함)이 create/update에 동일 복제돼 있고, `{ query: trim 1~200 }` 검색 스키마도 두 라우트에 각각 정의돼 변경 시 두 곳을 같이 고쳐야 합니다.
- 근거:

```ts
name: z.string().trim().min(1, "플레이리스트 이름을 입력해 주세요.")
  .max(50, "이름은 최대 50자까지 입력할 수 있어요."),
```

- 제안: 공용 스키마 조각(playlistNameSchema, searchQuerySchema)을 한 곳에 두고 양쪽에서 조합합니다.

### 9. [LOW] 라우트 파일 내부 순수 로직에 테스트가 없다

- 위치: apps/dashboard/src/app/api/tracks/route.ts:15-17, apps/dashboard/src/app/api/playlists/[id]/tracks/route.ts:115-118
- 규칙: ai-slop-cleaner 체크리스트 6 (테스트 누락, LOW)
- 사유: 대시보드 테스트 37개 파일 중 app/api를 참조하는 것은 타입 import뿐이라, 와일드카드 이스케이프(`escapeLikeWildcard`)와 제목 정규화 정규식 같은 DB·네트워크 의존이 없는 순수 로직이 회귀 검사 없이 라우트 파일에 남아 있습니다.
- 근거:

```ts
function escapeLikeWildcard(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
```

- 제안: 두 순수 함수를 lib로 옮기거나 최소한 스키마/정규식 단위 vitest를 추가합니다.

### 10. [LOW] import 문 쉼표 뒤 공백이 빠진 지점이 3곳 있다

- 위치: apps/dashboard/src/app/api/tracks/route.ts:6, apps/dashboard/src/app/api/servers/[id]/greeting/route.ts:3, apps/dashboard/src/app/api/servers/[id]/social/subscriptions/route.ts:7
- 규칙: ai-slop-cleaner 체크리스트 (형식화되지 않은 AI 생성 흔적)
- 사유: `publicReadLimit,rateKey`, `GreetingConfig,greetingConfigSchema`, `SocialSubscriptionResponse,SocialSubscriptionsResponse`처럼 쉼표 뒤 공백이 누락된 채 손으로 붙인 흔적이 남아 있어 포매터가 이 경로를 거치지 않았음을 보여줍니다.
- 근거:

```ts
import { guardRateLimit, publicReadLimit,rateKey } from "@/lib/rate-limit";
```

- 제안: 해당 파일을 포매터로 한 번 정리합니다.

## 검사했지만 문제 없는 항목

- R-02 (em dash): 유저에게 가는 더블/싱글 따옴표 문자열 전체 스캔에서 em dash 0건. 97줄의 em dash는 모두 코드 주석이고, 주석은 감사 기준 1의 대상이 아니며 기준 2의 금지 패턴(구분선/이모지/빈 라벨/엔드 마커)에도 해당하지 않습니다.
- R-16 (buzzwords)·챗봇 클로저·과장된 성공 문구: 0건. "AI 초안 생성"/"AI 수정"은 LLM 기능의 사실적 명칭이지 장식 배지가 아닙니다.
- R-17/R-36/R-38 (근거 없는 숫자·보장): 응답 메시지의 모든 숫자(3MB, 32자, 50자, 500자, 16개, 90일, 168시간, 커맨드/플레이리스트 상한)는 같은 파일의 상수 또는 zod 제약에 연결돼 있어 근거가 있습니다. "안전합니다"류 거짓 보장 0건. "잠시 후 다시 시도해 주세요"는 조치 가능한 안내이며 과장이 아닙니다.
- 주석 슬롭 금지 패턴 전수 검사: 구분선/박스 헤더 0건, 장식 이모지 0건, end marker 0건, 모호한 TODO 0건, 빈 라벨(// Main logic, // Error handling 등) 0건, JSDoc 시그니처 반복 0건.
- 보존 대상 주석 확인: SSRF 방지 계약(servers/[id]/player/play/route.ts:13), X-Forwarded-For 위조 제약(tracks/route.ts:21-22), IDOR fail-closed(servers/[id]/social/subscriptions/[subId]/route.ts:37-40), `rate: null` 면제 의도(servers/[id]/live/stream/route.ts:9-10, greeting/background/route.ts:7), TTL 폴백 동작(servers/[id]/settings/route.ts:98-100) 등 보안·프로토콜·트레이드오프 주석은 모두 정보 가치가 있어 그대로 두는 것이 맞습니다.
- 죽은 코드/미사용 export: 0건. stats 라우트의 StatsServerStatsResponse·LivePlayerState 타입은 컴포넌트가 type import해 사용 중이고, StatsTopTrack·StatsTopRequester도 같은 파일의 응답 계약에 쓰입니다.
- 잘못된 레이어 import: 0건. DB 접근은 @/lib/db, upstream은 data-api client 래퍼, 계약 스키마는 @sirubot/utils 서브패스 경유로 일관됩니다.
- 불필요 래퍼: 0건. toSummary(assets), readGuildMetaCache(greeting/preview), verifySubscriptionOwnership(subscriptions/[subId])는 각각 재사용·TTL 캐시·소유 검증 목적 있어 존재 이유가 분명합니다.
- 테스트 참조 검사: 대시보드 테스트 37개 파일 중 app/api 경로를 참조하는 파일은 player-live-tab.test.tsx(타입 import) 1개이며, 이를 findings 9로 기록했습니다.


---

TOTAL: 16 (HIGH:3 MEDIUM:6 LOW:7)

# 세그먼트 07: 대시보드 UI 프리미티브 (apps/dashboard/src/components/{ui,primitives,overlay,layout,navbar,discord,data,motion,licenses})

- 감사일: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 42개 (소스 37개, 테스트 5개. servers/player/playlists/home 폴더는 범위 밖)
- 감사 방식: read-only. 범위 내 파일 전량 열람 + contrast-check.py 대비 검증(warning/destructive/discord 틴트 배지, ring 토큰, muted 텍스트, avatar offline dot, menu focus accent) + em dash/이모지/구분선/TODO/엔드 마커 grep 전수 sweeps. 빌드·테스트·클릭 검증은 수행하지 않았다(세그먼트 규칙).

## Findings

### 1. [HIGH] 상태 틴트 배지의 12px 텍스트가 라이트 테마에서 AA 4.5:1에 미달한다

- 위치: apps/dashboard/src/components/ui/badge.tsx:16-20 (같은 톤 조합이 primitives/status-dot.tsx:7-10의 exported toneStyles에도 존재)
- 규칙: R-25 (Hard Gate)
- 사유: badge는 text-xs(12px)라 일반 텍스트 기준 4.5:1이 필요한데, contrast-check.py 결과 warning #9a6100 on bg-warning/10 = 4.49:1(흰 배경 위)~4.10:1(surface-2 위), destructive #d4183d on bg-destructive/10 = 4.46~4.47:1, discord #5865F2 on bg-discord-primary/10 = 라이트 3.87~4.04:1, 다크 3.09:1로 모두 FAIL했다. success(4.76:1)와 info(4.85:1)만 PASS라 같은 패턴 안에서도 일부 톤만 깨진다. design-tokens 스킬도 이 틴트 방식의 대비 문제와 솔리드 배지 전환이 미이관 상태임을 기록하고 있다.
- 근거:

```tsx
warning: "bg-warning/10 text-warning",
danger: "bg-destructive/10 text-destructive",
discord: "bg-discord-primary/10 text-discord-primary",
```

- 제안: warning/destructive/discord 배지만 솔리드 배경(또는 대비 검증을 통과한 틴트)으로 전환하고, 전환 시 scripts/wcag-contrast-audit.py로 재확인한다.

### 2. [HIGH] 라이트 테마 포커스 링(ring-ring = #ee6f8b)이 비텍스트 3:1 기준에 미달한다

- 위치: apps/dashboard/src/components/ui/button.tsx:11 (동일 패턴 input.tsx:17, textarea.tsx:14, select.tsx:44, switch.tsx:63, tabs.tsx:56, badge.tsx:9, toast.tsx:64, slider.tsx:81, color-picker.tsx:126,172,208)
- 규칙: R-32, R-34 (Hard Gate)
- 사유: focus-visible:ring-2 focus-visible:ring-ring이 범위 내 대부분의 컨트롤에 쓰이는데, --ring = var(--brand) 라이트값 #ee6f8b는 contrast-check.py 기준 라이트 배경 위 2.61:1(#fff0f0)~2.77:1(#fff9f9)~2.88:1(#ffffff)로 3:1에 못 미친다. 다크는 #f98aa0 기준 6.88~7.73:1로 PASS라 라이트에서만 포커스 인디케이터가 약해지는 R-34 테마 불균형이다.
- 근거:

```tsx
"group/button inline-flex shrink-0 items-center justify-center gap-2 rounded-control border-0 text-sm font-medium whitespace-nowrap transition-control duration-fast outline-none select-none focus-visible:ring-2 focus-visible:ring-ring ...
```

- 제안: 라이트 --ring을 브랜드 핑크 기준 3:1을 넘는 더 어두운 값(예: --primary-text 계열)으로 조정하거나, 링에 어두운 외곽 1px을 더해 대비를 확보한다.

### 3. [HIGH] Avatar offline 상태 점이 40% 불투명도로 거의 보이지 않는다(1.56~1.71:1)

- 위치: apps/dashboard/src/components/ui/avatar.tsx:32
- 규칙: R-25 비텍스트 3:1 (Hard Gate)
- 사유: offline 점은 bg-dot-neutral/40이라 dot-neutral(#7d686d/#b9a4a9)이 40%만 섞인다. contrast-check.py로 합성하면 라이트 배경 위 약 #cbbfc1 = 1.71:1, 다크 배경 위 약 #44373a = 1.56:1로 상태 표시기 최소 3:1에 크게 못 미친다. 점 주위가 border-background 링이라 페이지 배경과 점이 뭉개져, offline 상태는 시각적으로 사실상 제거된다. 상태 자체가 색상으로만 전달되며(aria-label은 영문이라 한국어 UI와도 어긋난다) 저시각 사용자에게 재설정 신호가 사라진다.
- 근거:

```tsx
offline: "bg-dot-neutral/40",
```

- 제안: offline도 최소 3:1을 넘는 불투명도/색으로 올리고, 점을 흰/검은 테두리로 띄워 어떤 배경 위에서도 형태가 읽히게 한다.

### 4. [MEDIUM] 메뉴·셀렉트 항목의 포커스 표시가 1.51:1 배경 전환에만 의존한다

- 위치: apps/dashboard/src/components/ui/select.tsx:120 (동일 패턴 dropdown-menu.tsx:92, command.tsx:159)
- 규칙: R-32 (약한 포커스 인디케이터)
- 사유: 포커스가 outline-hidden + focus:bg-accent로 처리되는데, accent 라이트 #ffc3c9는 흰 popover 위 1.51:1, 다크 #4d3b40는 #2b2023 위 1.51:1로 배경 전환이 매우 약하다. 텍스트 색은 accent-foreground로 바뀌지만 포커스와 선택(data-selected)이 같은 bg-accent를 써서, 키보드 사용자가 현재 항목을 구분하기 어렵다.
- 근거:

```tsx
"relative flex w-full cursor-default items-center gap-1.5 rounded-control py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground ...
```

- 제안: 포커스 링(ring-2 ring-ring 계열)을 명시적으로 추가해 선택 배경과 구분한다.

### 5. [MEDIUM] ChannelSelect/RoleSelect가 목록 null을 로딩·오류와 구분 없이 disabled로만 표시한다

- 위치: apps/dashboard/src/components/discord/channel-select.tsx:88,102 (role-select.tsx:74,88도 동일 구조)
- 규칙: R-27 (empty/loading/error state)
- 사유: `disabled={disabled || channels === null}`뿐이라, 데이터가 아직 안 왔는지 불러오기에 실패했는지 사용자에게 아무 신호가 없다. 선택기가 그냥 비활성화되어 로딩 중 오류로 읽히거나, 오류인데 무반응으로 남는다. 같은 범위의 license-list.tsx:72-77은 EmptyState로 빈 상태를 안내하는 대조 사례다.
- 근거:

```tsx
disabled={disabled || channels === null}
```

- 제안: loading/error/ready를 구분하는 상태 prop을 두어 로딩 스켈레톤과 오류 안내 문구를 각각 렌더하거나, 부모가 그 상태를 처리한다는 계약을 타입과 주석으로 명시한다.

### 6. [MEDIUM] 라이선스 외부 링크의 탭 타깃이 13px 아이콘 크기뿐이다

- 위치: apps/dashboard/src/components/licenses/license-list.tsx:101-104
- 규칙: R-03 (44px 미만 탭 타깃)
- 사유: aria-label은 잘 달려 있으나(p.101) 앵커에 패딩/최소 크기가 없어 터치 영역이 아이콘 13px 수준이다. 모바일에서 외부 저장소 링크를 정확히 누르기 어렵다. 같은 범위의 badge.tsx:78(after:inset으로 44px 히트 에어리어 확장)과 toast.tsx:133(after:-inset-2)은 히트 영역을 확장하는 관례가 이미 있다.
- 근거:

```tsx
className="shrink-0 text-muted-foreground transition-colors duration-fast hover:text-primary-text"
```

- `<ExternalLink size={13} aria-hidden />` 주위를 최소 44px 버튼(또는 after 히트 확장)으로 감싼다.

### 7. [MEDIUM] 한국어 UI에서 11~12px 소형 텍스트가 라벨·설명으로 반복 사용된다

- 위치: apps/dashboard/src/components/navbar/mobile-tab-bar.tsx:340 (text-2xs = 11px 탭 라벨), apps/dashboard/src/components/primitives/field.tsx:45,50 (설명·오류 12px), apps/dashboard/src/components/primitives/status-dot.tsx:50 (상태 라벨 12px)
- 규칙: 감사 기준 2 (한글 본문 14px 미만)
- 사유: 모바일 탭바의 "플레이리스트" 같은 한국어 네비게이션 라벨이 11px이고, 폼 설명/오류 메시지와 상태 라벨이 12px이다. 디자인 시스템이 text-2xs를 마이크로 라벨 대체 토큰으로 허용하고 있긴 하나, 본문 성격의 한국어 텍스트(특히 오류 안내)는 12px 이하에서 가독성이 떨어진다.
- 근거:

```tsx
className={`relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full px-1 py-1.5 text-2xs font-medium transition-colors duration-fast ${
```

- 제안: 탭바 라벨과 오류 메시지는 text-xs(12px) 이상, 이상적으로 본문 기준인 text-sm(14px)으로 올린다.

### 8. [MEDIUM] dark: 유틸리티가 컴포넌트 코드에 직접 남아 토큰 재정의 원칙과 어긋난다

- 위치: apps/dashboard/src/components/ui/button.tsx:30 (dark:bg-input/30 dark:hover:bg-input/50), apps/dashboard/src/components/ui/input-group.tsx:17 (dark:bg-input/30, dark:has-disabled:bg-input/80, dark:has-...:ring-destructive/40), apps/dashboard/src/components/ui/dropdown-menu.tsx:92 (dark:data-[variant=destructive]:focus:bg-destructive/20)
- 규칙: 감사 기준 4 (R-34 테마 체계)
- 사유: 프로젝트 디자인 시스템은 "다크는 CSS 변수 재정의만, 컴포넌트에서 dark: 변형을 새로 만들 필요 없다"고 규정하는데, shadcn 파운데이션 잔재로 세 파일에 dark: 분기가 남아 있다. 진단 예외(상태 색상)에도 해당하지 않는 입력 서피스/포커스 분기라, 토큰을 바꿀 때 이들 규칙이 따라오지 않아 한쪽 테마만 깨질 위험이 있다.
- 근거:

```tsx
"border border-border-strong bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-input/30 dark:hover:bg-input/50",
```

- 제안: 해당 다크 값을 .dark 변수 재정의로 옮기고 컴포넌트의 dark: 분기를 제거한다.

### 9. [MEDIUM] Field의 필수 표시(*)가 aria-hidden이고 렌더 프롭이 required를 넘기지 않는다

- 위치: apps/dashboard/src/components/primitives/field.tsx:37-41 (타입 field.tsx:6-10)
- 규칙: 감사 기준 2 (색상/장식만으로 상태 전달, 접근성)
- 사유: 필수 표시가 빨간 별표뿐이고 aria-hidden이라, 스크린 리더 사용자에게는 required 여부가 전달되지 않는다. FieldRenderProps에 required가 없어 렌더 프롭 경로에서는 컨트롤에 aria-required를 연결하기 어렵다. 별표는 색상+기호 신호지만 기호가 AT에는 숨겨져 있어 절반만 작동한다.
- 근거:

```tsx
<span aria-hidden className="ml-1 text-destructive">
	*
</span>
```

- 제안: FieldRenderProps에 required를 추가하고 별표에 "(필수)" 텍스트 대안을 넣거나, 컨트롤로 required를 전달해 aria-required가 걸리게 한다.

### 10. [LOW] CommandDialog의 기본 제목·설명이 영문으로 남아 있다

- 위치: apps/dashboard/src/components/ui/command.tsx:37-38
- 규칙: R-02/R-16 인접 (한국어 UI 기본 문구)
- 사유: 현재 유일한 소비자(global-command-palette.tsx:90)가 한국어 제목·설명을 넘겨 실제 화면에는 안 나오지만, 기본값이 "Command Palette"/"Search for a command to run..."이라 다른 곳에서 쓰면 영문이 노출된다. sr-only 안내라 접근성 텍스트이기도 해 한국어 기본값이 자연스럽다.
- 근거:

```tsx
title = "Command Palette",
description = "Search for a command to run...",
```

- 제안: 기본값을 한국어("명령 팔레트", "실행할 명령을 검색해요.")로 바꾼다.

### 11. [LOW] MockThumbnail이 영문 워터마크와 cn() 없는 템플릿 문자열 클래스를 쓴다

- 위치: apps/dashboard/src/components/primitives/mock-thumbnail.tsx:6,9
- 규칙: 감사 기준 6 (중복 스타일/컨벤션)
- 사유: "No Image"가 한국어 UI에서 영문으로 노출된다. 또한 className을 템플릿 리터럴로 이어 붙여 범위 내 다른 컴포넌트의 cn() 관례와 다르다(충돌 클래스 병합이 안 된다). 그라데이션 자체는 썸네일 부재 표면이라는 목적이 주석에 적혀 있어(R-01 목적 통과) 문구와 클래스 작성 방식만 문제다.
- 근거:

```tsx
<div className={`flex flex-col items-center justify-center bg-gradient-to-br from-primary/20 via-primary/5 to-secondary/20 relative ${className}`}>
```

- 제안: "이미지 없음" 등 한국어 문구로 바꾸고 cn()으로 클래스를 병합한다.

### 12. [LOW] PageHeader가 cn() 대신 템플릿 리터럴로 className을 합성한다

- 위치: apps/dashboard/src/components/layout/page-header.tsx:21
- 규칙: 감사 기준 6 (중복 스타일/컨벤션)
- 사유: `className={\`...\${className}\`}` 방식이라 호출자가 충돌 클래스를 넘길 때 tailwind-merge가 작동하지 않는다. 범위 내 나머지 컴포넌트는 모두 cn()을 쓴다.
- 근거:

```tsx
<header className={`mb-6 flex flex-col lg:flex-row lg:items-end justify-between gap-4 sm:gap-6 pb-6 relative ${className}`}>
```

- 제안: cn(...)으로 교체한다.

### 13. [LOW] Button과 Badge에 의미 없이 중복된 variant 별칭이 있다

- 위치: apps/dashboard/src/components/ui/button.tsx:15-16 (default == primary), button.tsx:22,28 (danger == destructive), apps/dashboard/src/components/ui/badge.tsx:17-18 (danger == destructive, dotVariants 43-44도 중복)
- 규칙: 감사 기준 6 (죽은 코드/중복 스타일)
- 사유: 두 이름이 같은 클래스 문자열을 가리켜, 어느 쪽이 정식 이름인지와 둘 중 하나를 쓰지 않게 할 규칙이 사라진다. 새 variant 추가 시 두 곳을 같이 고쳐야 하는 유지 비용도 생긴다.
- 근거:

```tsx
default: "bg-primary text-primary-foreground hover:bg-primary/70",
primary: "bg-primary text-primary-foreground hover:bg-primary/70",
```

- 제안: 정식 이름 하나만 남기거나(호출부 마이그레이션), 별칭이 의도라면 각 주석으로 계약을 남긴다.

### 14. [LOW] Skeleton이 pulseBase 상수를 두고도 같은 클래스 문자열을 다시 쓴다

- 위치: apps/dashboard/src/components/primitives/skeleton.tsx:20,56
- 규칙: 감사 기준 6 (중복 스타일)
- 사유: `const pulseBase = "animate-pulse rounded-md bg-muted"`를 정의해 놓고 Skeleton 컴포넌트는 같은 문자열을 인라인으로 다시 적어, 한쪽만 바꾸면 스켈레톤 스타일이 갈라진다.
- 근거:

```tsx
return <div data-slot="skeleton" className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
```

- 제안: `cn(pulseBase, className)`으로 통일한다.

### 15. [LOW] ChannelSelect와 RoleSelect가 선택값 유지 로직과 셀렉트 배선을 복제한다

- 위치: apps/dashboard/src/components/discord/channel-select.tsx:67-70,94-105 (role-select.tsx:54-57,80-91에 동일 구조)
- 규칙: 감사 기준 6 (중복)
- 사유: keepMissing selectedIds useMemo와 단일/다중 SearchableSelect 분기가 두 파일에 그대로 복제돼 있다. 두 선택기 중 하나에만 수정(예: 이전 Finding 5의 상태 처리)이 들어가면 나머지가 어긋난다.
- 근거:

```tsx
const selectedIds = useMemo(() => {
	if (!keepMissing) return [];
	return props.multiple ? (props.value ?? []) : props.value ? [props.value] : [];
}, [keepMissing, props.multiple, props.value]);
```

- 제안: selectedIds 계산과 단일/다중 렌더 분기를 공용 헬퍼로 뽑는다.

### 16. [LOW] 범위 내 42개 파일 중 테스트가 5개 파일에만 있다

- 위치: apps/dashboard/src/components/ui/color-picker.tsx 전체 (테스트 없음. 반면 slider.test.tsx, toast.test.tsx, navbar/mobile-tab-bar.test.tsx, navbar/tab-bar-math.test.ts, discord/discord-options.test.ts는 존재)
- 규칙: 감사 기준 6 (테스트 누락, LOW)
- 사유: color-picker는 키보드 한 스텝/드래그 커밋/HEX 정규화/무채색 유지 같은 회귀 지점이 많은데 테스트가 없다. badge dismiss, field의 describedBy/invalid 배선, empty-state 문자열 action 분기도 마찬가지다. 기존 테스트들은 계약(히트 영역, 키보드 커밋, 구조 트립와이어)을 잘 고정하고 있어 같은 방식을 이어갈 여지가 있다.
- 근거:

```ts
// @vitest-environment happy-dom
import { act } from "react";
```

- 제안: color-picker 키보드/커밋 계약과 Field의 aria 배선부터 회귀 테스트를 추가한다.

## 검사했지만 문제 없는 항목

- R-01 그라데이션: 범위 내 하드코딩 파랑-보라 그라데이션 없음. 그라데이션은 color-picker HSV 편집 표면(목적이 주석에 명시, color-picker.tsx:28)과 mock-thumbnail 부재 표시(목적 명시, mock-thumbnail.tsx:3)뿐이며 모두 토큰/기능 기반이다. COLOR_PRESETS 하드코딩 hex는 사용자 색 데이터라는 주석이 있어 패키지 위반이 아니다(color-picker.tsx:8).
- R-09 배지: "New/Beta" 식 장식 pill 없음. Badge 변형은 모두 상태(勝/경고/오류/정보/Discord)용이며 license-list의 개수 배지도 실제 데이터다. Eyebrow pill(H1 위 라벨 pill) 없음(page-header.tsx).
- R-13 glow: 범위 내 glow/shadow-glow 없음.
- R-04 이모지: 범위 내 장식 이모지 grep 0건. 아이콘은 모두 기능적(lucide, 실제 채널 종류/트렌드 방향/상태 표시).
- R-11 반경: rounded-control/menu/card/dialog 역할 토큰이 일관되게 쓰인다. capsule은 배지·스위치·탭 알약·슬라이더 thumb 등 기능적 요소뿐이라 "전부 pill"이 아니다.
- R-12 그림자: shadow-sm(카드)/2xl(오버레이) 등 elevation 사다리 안에 있고, card.tsx:7-8에 보더리스+elevation 근거가 남아 있다(보존할 주석).
- R-05 그리드: 범위 내 bento/균등 3~4열 그리드 없음(페이지 구성은 세그먼트 05 범위).
- R-24/R-26 죽은 링크·컨트롤: navLinks 5개 모두 실제 라우트이며 미로그인 시 로그인 콜백으로 바뀐다(links.ts:17-21). 명령 팔레트 항목도 전부 router.push를 수행한다. 동작 없는 버튼·폼 없음.
- R-32 키보드: Base UI 프리미티브로 Escape/포커스 위임이 제공되고, color-picker는 role=slider + 방향키(67-86행), 배지 dismiss는 44px 히트 확장(after:inset, badge.tsx:78), 토스트 닫기도 after:-inset-2(toast.tsx:133)로 터치 영역을 확보한다. dialog/sheet 닫기 버튼과 sr-only "닫기"도 있다.
- 모바일 긍정 사례: 모바일 탭바는 min-h-12(48px) 타깃 + safe-area 패딩(313행) + pointer 드래그에 click guard, reduced-motion이면 duration 0 즉시 스냅(107,202행). color-picker 프리셋/색상 바는 pointer-coarse에서 44px로 커진다(170,208행). dialog는 max-w-[calc(100%-2rem)]로 폭 재진다. 100vh 섹션·고정 px 폭·overflow hidden 클리핑 없음.
- R-27 부분 준수: EmptyState 프리미티브가 제목/설명/액션을 갖고 license-list 빈 검색 결과에 쓰인다(72-77행). SkeletonCard는 role="status" + "로딩 중" 라벨을 가진다(skeleton.tsx:33-34). Finding 5의 선택기만 예외.
- R-19 모션: status-dot는 안정 상태(READY/IDLE)를 정적으로 그리고 연결 중·오류만 펄스로 한정하는 근거 주석이 있다(status-dot.tsx:42). reveal은 whileInView + once라 무한 루프가 없고 framer 모션은 전역 MotionConfig reducedMotion="user"를 받는다. 장식 상태 dot 남용 없음.
- R-17/R-36 날조 데이터: stat-card는 호출자 값만 렌더하고 라이선스 수치는 커밋된 JSON 기반이다. 날조 통계·후기 없음.
- 대비 PASS 확인(contrast-check.py): muted 텍스트 #7d686d는 라이트 4.66~5.16:1, #b9a4a9는 다크 5.65~6.71:1로 AA PASS. 배지 default의 text-foreground/80 합성(#615659 on #fff0f0)도 6.36:1 PASS. 다크 상태 배지(warning #fbbf24 = 7.58:1, destructive #ff7b8a = 5.42:1)도 PASS라 Finding 1은 라이트 틴트와 discord 고정색에 한정된다.
- 주석 슬롭: 구분선/단계 내레이션/빈 라벨/모호 TODO/엔드 마커/장식 이모지 grep 0건. dialog.tsx:33(blur 렉 방지), switch.tsx:17-36(트랙 지오메트리), tabs.tsx:57(Base UI data-active 매칭 함정), toast.tsx:12-15(단일 매니저 계약) 등은 왜를 설명하는 보존 대상이다.
- em dash(R-02) 관련 사실 기록: 범위 내 em dash 55건은 전부 코드 주석·테스트 이름이며 사용자에게 보이는 UI 문자열에는 0건이다. R-02가 다루는 대상은 에이전트가 작성하는 UI 카피이고, antislop-copywriting의 지침대로 단독 em dash는 사람 문체의 일환일 수 있어 주석의 하드코딩 금지로 확대하지 않았다. 다만 새로 쓰는 UI 카피에는 적용하지 않아야 한다.
- R-30 클론: Discord 스타일 요소(채널/역할 선택, discord 토큰)는 제품 도메인이 Discord 봇 대시보드라 의도된 정체성이다.
- 미검증 항목(정직한 한계): read-only 세그먼트 규칙상 빌드·실행·클릭 검증과 실제 라이트/다크 전환 및 브레이크포인트 육안 확인은 수행하지 않았다(R-35 미수행). Finding 2의 링 대비와 Finding 1의 배지 대비는 contrast-check.py 수치 기준이며, 런타임 렌더 배경에 따라 ±0.1 수준 변동이 있을 수 있다.


---

TOTAL: 16 (HIGH:5 MEDIUM:4 LOW:7)

# 세그먼트 08: 대시보드 기능 UI 컴포넌트 (apps/dashboard/src/components/{servers,player,playlists,home})

- 감사일: 2026-10-22
- 브랜치: chore/antislop-audit
- 감사 파일 수: 86개 (servers 58, home 16, player 6, playlists 6, 이 중 테스트 파일 7 포함)
- 감사 방식: read-only. 86개 파일 전량 em dash/버즈워드/그라데이션/그림자/글로우/pill/배지/저대비 텍스트/탭 타깃/hover 전용/클리핑/고정 폭/구분선 주석/장식 이모지/TODO/미사용 export/테스트 참조 전수 grep, 핵심 40여 개 파일 전문 열람. R-25 대비는 contrast-check.py로 산출.

## Findings

### 1. [HIGH] 사용자에게 노출되는 문자열 4곳에 em dash 문자가 사용됐다 (R-02)

- 위치: apps/dashboard/src/components/servers/bot-profile-settings.tsx:301 (화면 텍스트), servers/avatar-crop-modal.tsx:272 (aria-label), servers/social/add-subscription-form.tsx:313 (placeholder), servers/custom-command/custom-command-designer.tsx:132 (라벨 텍스트)
- 규칙: R-02 (Hard Gate, em dash 금지)
- 사유: R-02는 사용자에게 보이는 텍스트에서 em dash 문자를 금지한다. 이 4곳은 화면 텍스트, 스크린 리더 라벨, 인풋 placeholder로 직접 노출된다.
- 근거:

```tsx
aria-label="크롭 영역 — 드래그로 위치를 옮기고 방향키도 쓸 수 있어요"
placeholder={`기본: 시루 소셜 알림 — ${resolved?.name ?? "채널 이름"}`}
```

- 제안: 4곳 모두 쉼표 또는 괄호 대체(예: "크롭 영역, 드래그로 ...", "기본: 시루 소셜 알림(채널 이름)")로 교체.

### 2. [HIGH] 플레이리스트 목록 끝 안내 블록의 본문·버튼 대비가 1.73:1로 AA 기준에 미달한다 (R-25)

- 위치: apps/dashboard/src/components/playlists/playlist-detail.tsx:252 (opacity-40 컨테이너), :254 (본문 텍스트), :256 (ghost 버튼)
- 규칙: R-25 (Hard Gate, 본문 4.5:1)
- 사유: `opacity-40` 컨테이너 안에서 text-muted-foreground(#7d686d)를 #ffffff 카드 위에 렌더해 대비가 1.73:1로 본문/대형 모두 FAIL한다. 컨테이너 안의 "곡 추가 버튼을 눌러..." ghost 버튼도 같은 저대비에 노출된다.
- 근거:

```tsx
<div className="... py-12 mt-4 text-center opacity-40 select-none ...">
  <span>더이상 표시할 곡이 없어요</span>
  <Button variant="ghost" size="sm" ...>곡 추가 버튼을 눌러 플레이리스트를 채워보세요!</Button>
```

(contrast-check.py 결과: #cbc3c5 on #ffffff = 1.73:1, normal/large 모두 FAIL)

- 제안: opacity-40 제거 후 muted-foreground 원색(5.16:1)으로 두거나, 안내 문구를 일반 본문 크기·색으로 올리고 버튼만 별도 강조. "더이상"은 "더 이상"으로 띄어쓰기 수정.

### 3. [HIGH] 채팅 유틸 설명 문장 2곳의 텍스트 대비가 3.32:1로 AA 본문 기준에 미달한다 (R-25)

- 위치: apps/dashboard/src/components/servers/chat-tools-settings.tsx:188, :206
- 규칙: R-25 (Hard Gate, 본문 4.5:1)
- 사유: text-sm(14px) 본문에 text-muted-foreground/80을 적용했다. 토큰 #7d686d에 알파 0.8을 곱한 결과색은 #ffffff 카드 위에서 3.32:1로 본문 기준(4.5:1)에 미달한다.
- 근거:

```tsx
<p className="text-sm font-medium text-muted-foreground/80">
  커스텀 이모지만으로 보낸 메시지를 큰 이미지로 다시 보내줘요. ...
```

(contrast-check.py 결과: #978a8a on #ffffff = 3.32:1, normal FAIL / large PASS)

- 제안: /80 알파를 제거한 text-muted-foreground(5.16:1)로 교체. 같은 패널의 다른 설명문도 기본 토큰을 쓰므로 통일된다.

### 4. [HIGH] 터치 타깃이 44px 미만인 컨트롤이 기능 UI에 남아 있다 (R-03)

- 위치: apps/dashboard/src/components/player/web-player-section.tsx:320 (검색어 지우기 h-5 w-5), servers/settings-shared.tsx:340 (저장 바 "변경 사항 저장" h-8), servers/custom-command/custom-command-designer.tsx:141 (강조색 스와치 h-5 w-5), servers/mixer-info.tsx:154 (설명 (i) 버튼 size-6), servers/searchable-select.tsx:180 (선택 해제 X h-3.5 w-3.5), servers/custom-command/custom-command-steps-editor.tsx:132 (이동 버튼 size icon-xs), home/hero-section.tsx:264 (명령어 예시 칩 py-1.5 text-xs)
- 규칙: R-03 (Hard Gate, 44px 탭 타깃)
- 사유: 이 저장소에는 터치 확장 관례가 이미 있다(features-section.tsx:22 `pointer-coarse:min-h-11`, guild-card.tsx:14 주석 "44px(pointer-coarse:min-h-11) 터치 영역", bot-profile-settings.tsx:324). 위 7곳은 그 관례를 적용하지 않아 모바일에서 14~36px 타깃으로 남는다. SaveBar는 모바일에서 하단 고정 바로 노출돼 직접적 영향이 크다.
- 근거:

```tsx
className="absolute right-2.5 top-1/2 inline-flex h-5 w-5 ... focus-visible:ring-2 ..."
className="h-8 px-3.5" ... >{saving || submitting ? "저장 중…" : "변경 사항 저장"}
```

- 제안: 각 컨트롤에 `pointer-coarse:min-h-11 pointer-coarse:min-w-11` 또는 after:inset 확장(ui/badge.tsx:78의 `after:inset-[min(0px,calc((100%-44px)/2))]` 선례)을 적용.

### 5. [HIGH] 플레이리스트 트랙 재정렬이 드래그 전용이라 키보드·터치로 동작하지 않는다 (R-32)

- 위치: apps/dashboard/src/components/playlists/playlist-detail.tsx:175 (draggable 행), :181-186 (그룹 hover로만 보이는 Move 핸들)
- 규칙: R-32 (Hard Gate, 키보드 조작 가능해야 함)
- 사유: 행은 HTML5 drag&drop(onDragStart/onDrop)에만 의존하고, 핸들 아이콘은 `group-hover:block`이라 터치 기기에서 나타나지 않는다. 위/아래 이동 버튼 등 키보드 폴백이 없어 키보드 사용자는 순서를 바꿀 수 없다. 같은 저장소 custom-command-steps-editor.tsx:130-145에는 aria-label이 달린 "위로 이동/아래로 이동" 버튼이라는 올바른 선례가 있다.
- 근거:

```tsx
<div ... draggable onDragStart={(e) => onDragStart(e, idx)} onDrop={(e) => onDrop(e, idx)}>
  <Move size={14} className="... hidden group-hover:block cursor-grab ..." />
```

- 제안: 행마다 위/아래 이동 버튼(또는 포커스 시 키보드 단축키)을 추가하고, 핸들을 hover 없이도 노출되게 변경.

### 6. [MEDIUM] AI 설정과 채팅 유틸의 모드 선택 카드 마크업이 복제돼 있다 (중복, ai-slop-cleaner 체크리스트 3)

- 위치: apps/dashboard/src/components/servers/ai-settings.tsx:36-60 (MODE_CARDS), :192-234 (radiogroup 렌더); servers/chat-tools-settings.tsx:56-104 (동일 구조 MODE_CARDS + ModePicker)
- 규칙: AI 코드 슬롭(컴포넌트 간 복붙)
- 사유: 3열 radiogroup 카드(role="radio", 활성 시 bg-primary/10 ring-2, 우상단 체크 원) 마크업이 라벨·아이콘만 다르고 두 패널에 복제됐다. chat-tools-settings.tsx:55 주석은 "AI 설정 패널과 같은 radiogroup 마크업을 재사용해요"라고 쓰지만 실제로는 import가 아니라 복사다.
- 근거:

```tsx
/** 채널 정책 카드 — AI 설정 패널과 같은 radiogroup 마크업을 재사용해요 */
const MODE_CARDS: Array<{ value: ...; label: string; description: string; icon: React.ReactNode }> = [
```

- 제안: ModePicker/MODE_CARDS 를 servers/settings-shared.tsx 등 공용 모듈로 추출하고 양쪽 패널에서 data만 주입.

### 7. [MEDIUM] 기능 블록 개수를 적은 주석이 실제와 다르다 (주석 슬롭: 사실 오류)

- 위치: apps/dashboard/src/components/home/features-section.tsx:236
- 규칙: antislop-code(주석은 코드가 모르는 사실을 진실되게 담아야 함), R-31
- 사유: 주석은 "기능 블록 7개"라고 적지만 FEATURE_BLOCKS(:60-139)에는 music, playback, chat-tts, chat, custom-commands, greeting, profile, playlist, dashboard 9개가 있다. 틀린 숫자는 주석이 없는 것보다 나쁘다.
- 근거:

```tsx
{/* 기능 블록 7개 — 위아래로 교차(홀수 인덱스는 데모가 왼쪽) */}
{FEATURE_BLOCKS.map((block, index) => (
```

- 제안: "기능 블록 9개"로 수정하거나 숫자를 쓰지 않음.

### 8. [MEDIUM] 한글 안내 문구가 11px(text-2xs)으로 설정된 곳이 있다 (가독성)

- 위치: apps/dashboard/src/components/home/command-list-section.tsx:102, home/features-section.tsx:187, :191, servers/asset-picker.tsx:219, servers/mixer-info.tsx:82
- 규칙: antislop-human(본문 가독성), R-06
- 사유: --text-2xs는 0.6875rem(11px)이다(globals.css:154). 위 항목은 데모 목업이 아닌 제품 본문·라벨에 11px 한글을 쓴다. Discord 목업(discord-command-animation, previews)의 text-2xs는 실제 Discord `-#` subtext 밀도를 재현하는 의도라 제외했다.
- 근거:

```tsx
<p className="text-2xs font-medium text-muted-foreground mt-1">대표 슬래시 커맨드 40개 · 모든 기능 무료</p>
<p className="text-2xs font-medium text-muted-foreground">지원 음원</p>
```

- 제안: 제품 본문 라벨은 text-xs(12px) 이상으로 올리고, 11px은 목업/장식성 요소에만 유지.

### 9. [MEDIUM] 일별 재생 막대 차트의 값이 hover title 속성에만 있어 스크린 리더·터치로 읽을 수 없다 (R-27/R-32)

- 위치: apps/dashboard/src/components/servers/server-stats-tab.tsx:163-176
- 규칙: R-27(상태·데이터가 지각 가능해야 함), antislop-human(형태·색만으로 데이터 전달 금지)
- 사유: 막대마다 accessible 이름이 없고 값(날짜·횟수)은 native title 속성에만 있다. 터치 기기에서는 title 툴팁이 뜨지 않고, 스크린 리더는 막대를 이름 없는 그래픽 요소로 읽는다. 같은 파일의 TopTrackList/RequesterList는 텍스트 목록이라 문제가 없다.
- 근거:

```tsx
<div key={entry.date}
  title={`${formatDate(entry.date)} · ${entry.count}회`}
  className="min-w-[0px] flex-1 origin-bottom rounded-t bg-primary-control/60"
```

- 제안: 각 막대에 `aria-label={...}` 부여 또는 `role="img"` 캔버스 대신 텍스트 대체(요약 문장 또는 스크린리더용 표)를 함께 제공.

### 10. [LOW] 소셜 알림 미리보기 샘플 URL에 밈/가짜 주소가 들어간다 (R-38)

- 위치: apps/dashboard/src/components/servers/social/add-subscription-form.tsx:132 (dQw4w9WgXcQ), :342 (https://example.com); servers/social-alerts-settings.tsx:43 (dQw4w9WgXcQ), :46 (twitch.tv/example), :48 (chzzk.naver.com/live/12345)
- 규칙: R-38 (Real Content or Honest Placeholder)
- 사유: "미리보기" 라벨이 있어 목업으로 이해되지만, 릭롤 URL(dQw4w9WgXcQ)은 실제 영상 주소를 그대로 노출해 장난스러운 인상을 준다. 예약 도메인(example.com)과 존재하지 않는 숫자 ID(/live/12345)는 의도가 드러나는 표시로 바꿀 수 있다.
- 근거:

```ts
sample: { platform: "youtube", ..., title: "새 영상 제목", url: "https://youtu.be/dQw4w9WgXcQ", ... }
```

- 제안: 예약 도메인 표기(예: https://www.youtube.com/channel/실제채널ID 형식의 안내 또는 {url} 자리 표시)로 통일.

### 11. [LOW] 편집기 주석에 박스 드로잉 구분선(──)이 쓰였다 (주석 슬롭: 장식 구분선)

- 위치: apps/dashboard/src/components/servers/member-greeting/greeting-image-editor.tsx:64, :78, :98, :116, :127, :203, :221, :229 (8곳); servers/mixer-info.tsx:35
- 규칙: antislop-code(Decorative Separators)
- 사유: 각 주석은 정보를 담고 있으나 앞뒤 `──` 장식과 끝의 `──`는 구분선 장식만 남긴다. antislop-code는 같은 패턴을 "장식이 곧 메시지"로 보고 plain 한 줄을 권한다.
- 근거:

```ts
// ── 편집 상태 — imageRef는 patchImage가 동기적으로 갱신해요 (히스토리 커밋이 최신값을 읽기 위함) ──
// ── 되돌리기/다시실행 — 조작 단위로 commit()이 호출돼 한 단계씩 쌓여요 ──
```

- 제안: `// 편집 상태: imageRef는 ...` 형태의 일반 주석으로 교체(내용은 유지).

### 12. [LOW] 한국어 주석 전체가 em dash 설명선 관례를 쓴다 (R-02 정합성)

- 위치: 범위 전역, 약 100곳. 대표: servers/server-stats-tab.tsx:35, servers/settings-shared.tsx:60, player/player-live-tab.tsx:33, playlists/playlist-form-modal.tsx:47
- 규칙: R-02 (Hard Gate의 문자 규칙과의 정합성)
- 사유: 사용자 카피가 아닌 코드 주석이라 제품 영향은 없지만, 저장소 전체가 em dash 금지 규칙(R-02)을 주석 관례로만 계속 쓰고 있어 규칙 적용 범위(주석 포함 여부)가 불명확하다. finding 1의 사용자 노출 4곳과 같은 문자를 주석이 양산해 재발을 키운다.
- 근거:

```ts
/** 표시 이름 폴백 — 봇 캐시 조회 실패(탈퇴한 멤버 등)면 사용자 ID 앞 6자리 라벨로 표시해요 */
```

- 제안: 규칙을 "제품 카피 금지, 주석 허용"으로 문서화하거나, 신규 주석부터 콜론/괄호 대체 관례로 전환(기존 것은 대규모 리라이트 대상 아님).

### 13. [LOW] 플레이리스트 사이드바 검색 인풋에 accessible 이름이 없다

- 위치: apps/dashboard/src/components/playlists/playlist-sidebar.tsx:45-51
- 규칙: antislop-human(키보드·스크린 리더), R-32
- 사유: placeholder("검색...")만 있고 label/aria-label이 없다. 관례 있는 searchable-select.tsx:213은 `aria-label="검색"`을 달고 있어 불일치도 있다.
- 근거:

```tsx
<Input type="text" placeholder="검색..." value={searchQuery} onChange={...} className="bg-input/50 py-2 ..." />
```

- 제안: `aria-label="플레이리스트 검색"` 추가.

### 14. [LOW] 사용자 안내 문구에 서버 환경변수명(JTC_EMPTY_GRACE_MS)이 노출된다

- 위치: apps/dashboard/src/components/servers/jtc-settings.tsx:214-216
- 규칙: R-15/R-36(사용자 카피는 사용자 언어로)
- 사유: 서버 운영자가 바꿀 수 없는 내부 env 변수명이 사용자 안내문에 그대로 노출돼 정보성보다 혼란이 크다.
- 근거:

```tsx
<p>비어 있는 임시방은 30초 후 자동으로 삭제돼요. (서버 설정 JTC_EMPTY_GRACE_MS로 조정 가능)</p>
```

- 제안: "서버 설정으로 조정할 수 있어요" 수준으로 완화하고 env 변수명은 개발 문서로 옮김.

### 15. [LOW] 파일 외부에서 쓰이지 않는 export 타입이 있다 (죽은 코드 경계)

- 위치: apps/dashboard/src/components/home/discord-command-animation.tsx:12 (TrackInfo), :19 (SlideConfig)
- 규칙: AI 코드 슬롭(미사용 export)
- 사유: 두 인터페이스는 같은 파일 내부에서만 사용된다. 외부 import는 hero-section의 slideConfigs 값 import뿐(grep 전수 확인).
- 근거:

```ts
export interface TrackInfo { title: string; artist: string; ... }
export interface SlideConfig { command: string; args: string; }
```

- 제안: export 키워드만 제거해 내부 타입으로 좁힘.

### 16. [LOW] 신규 기능 UI 대부분에 테스트가 없다 (테스트 누락)

- 위치: 범위 전체. 테스트 존재: servers/server-switcher.test.tsx, servers/settings-shared.test.tsx, servers/guild-unavailable-panel.test.tsx, servers/social/template-editor.test.tsx, servers/member-greeting/greeting-draw.test.ts, servers/custom-command/custom-command-editor.utils.test.ts, player/player-live-tab.test.tsx (7개)
- 규칙: 테스트 누락(LOW)
- 사유: playlists 6파일, home 15파일, player 나머지(now-playing-card, web-player-section, live-progress-bar), servers 설정 패널 전반(ai/music/jtc/channel/chat-tools/assets/custom-commands/social/member-greeting)에 단위 테스트가 없다. 상태 전환이 많은 SaveBar/PanelError 조합은 settings-shared 테스트로 부분 커버된다.
- 근거: 디렉터리별 *.test.* 파일 카운트 7/86.
- 제안: 우선순위는 순수 로직(live-progress-bar의 interpolatedPositionMs, custom-command steps 편집, social sampleFor)부터.

## 검사했지만 문제 없는 항목

- R-16 버즈워드(원활한/혁신적/Seamless/혁신/ Cutting Edge 등): 범위 전체 grep 0건. 카피가 동작 중심 한국어("재생을 요청했어요.", "다른 검색어로 다시 시도해 주세요")로 작성돼 있다.
- R-17 숫자·통계: hero-section.tsx:225-232의 "72개"는 `실측: 2026-10-09, 톱레벨 Command 23 + 서브커맨드 49` 주석으로 근거가 있고, command-list-section.tsx:102의 "40개"는 실제 나열된 40개 목록과 일치, server-stats-tab의 모든 수치는 API 응답에서 온다. footer(범위 밖이지만 참조)에서 이전에 28K+ 통계를 제거한 흔적도 확인.
- R-15 범용 CTA: "지금 초대하기", "대시보드 시작하기", "첫 명령어 만들기", "변경 사항 저장" 등 동작 specific 문구만 사용.
- R-18 가짜 후기/인물: AI 아바타, 가상 이름 후기 섹션 없음. 목업의 "사용자"/"@사용자"는 Discord 프레임 목업의 명시적 플레이스홀더.
- R-01 그라데이션/기본 블루: 그라데이션은 전부 primary 토큰 알파 조합(예: member-greeting-preview 프리셋, mock-thumbnail 폴백 표면)이거나 기능적 용도(color-picker 채도/명도 그라데이션, invite-ticket mask-image)다. blue-purple 기본 그라데이션 없음. hex 하드코딩은 color-picker 프리셋과 greeting-section 기본 강조색(#ffdaff, 주석에 근거 기재)에 한정.
- R-12/R-13 그림자·글로우: 그림자는 elevation 언어(sm 카드, 2xl 팝오버)로 일관, 전면 발광(glow) 없음. invite-ticket의 drop-shadow 2단은 티켓 모티프 목적 주석이 있다.
- R-09 배지: LIVE/공식/상태/곧 만나요 배지는 실제 상태·라벨이며 dot은 상태(StatusDot, label 동반)에만 쓰인다. 장식용 "AI Powered"류 캡슐 없음.
- R-14/R-05 카드 나열: 홈 기능 섹션은 텍스트/데모 교차 2열 구조(features-section.tsx:150-208), 명령어 섹션은 카드 대신 헤어라인 메뉴판(command-list-section.tsx:128-138)으로 구성 변화가 있다. 균등 카드 그리드+bento 남용 없음.
- R-27 3상태: 플레이어(player-live-tab loading/empty/error + hub 미연결 안내), 검색 결과(web-player-section empty/error notice), 재생목록(playlist-detail loading/no-selection/empty + sidebar 검색 무결과), 통계(server-stats-tab error/skeleton/empty), 에셋(asset-picker loading/error/empty + 재시도), 커스텀 명령어(custom-commands-settings loading/error/empty + 액션)가 모두 구비돼 있고, EmptyState가 원인과 다음 행동을 설명한다.
- R-32 포커스: 범위 내 outline-none은 대부분 `focus-visible:ring-2 focus-visible:ring-ring`으로 교체돼 있고(web-player-section:320, avatar-crop-modal:279, server-feature-sidebar:50 등), 버튼 기본형에 focus-visible ring이 내장된다(ui/button.tsx:11). 모달은 Esc 닫힘(mixer-info:134-141, dialog 기본), 크롭 뷰포트는 방향키 이동 지원(avatar-crop-modal:199-208).
- 모바일 재흐름: 길드 카드는 한 행 리스트로 붕괴(guild-card.tsx:12-14), 서버 대시보드 탭은 가로 스크롤 + 선택 탭 자동 스크롤(server-dashboard.tsx:138-159), 플레이리스트는 lg 미만 전용 select(playlist-select-mobile), 곡 추가 모달은 visualViewport로 모바일 키보드를 피한다(add-track-modal.tsx:48-81), 하단 저장 바는 safe-area와 탭바 높이를 피한다(settings-shared.tsx:330). overflow hidden 클리핑으로 텍스트가 잘리는 곳은 확인하지 못함.
- 챗봇 클로저·헤딩 장식 이모지: "도움이 되셨나요"류 클로저 없음, 헤딩에 이모지 장식 없음. 이모지는 Discord 목업 메시지 본문(실제 봇 전송 문자열 모사)에만 쓰인다.
- 주석 슬롭 기타: TODO/FIXME 0건, ALL CAPS 구분선/단계 내레이션/빈 라벨/엔드 마커/장식 이모지 주석 0건. 대부분의 주석이 왜(constraint·성능·접근성)를 담아 보존 가치가 있다(예: player-live-tab:56 429 지터 근거, avatar-crop-modal:289 마스크 shadow 근거, mixer-info:12 모션 목적 R-19 명시).


---

TOTAL: 11 (HIGH:0 MEDIUM:6 LOW:5)

# 세그먼트 09: 대시보드 lib/hooks (apps/dashboard/src/lib, apps/dashboard/src/hooks)

- 감사일: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 75개 (lib 64개, hooks 11개, src 최상위 .ts/.tsx 0개. 이 중 테스트 파일 23개 포함)
- 감사 범위: lib/**, hooks/**, src 최상위 파일만. components/와 app/는 범위 밖(각각 세그먼트 08, 05).
- 감사 방식: read-only. lib/hooks 전량 열람 + em dash/이모지/TODO/구분선/단계 내레이션/빈 라벨/엔드 마커/영문 CTA/버즈워드/미사용 export/테스트 파일 유무 전수 grep 검증. 수정·빌드·테스트 실행 없음.

## Findings

### 1. [MEDIUM] 본문 error 메시지 추출 로직이 3곳에 중복 구현된다

- 위치: apps/dashboard/src/lib/api-error.ts:12 (표준 구현), apps/dashboard/src/hooks/use-social-alerts.ts:46, apps/dashboard/src/hooks/use-playlists.ts:139
- 규칙: 감사 기준 2 (AI 코드 슬롭: 응답/에러 헬퍼 중복)
- 사유: "JSON 본문의 error 문자열이 있으면 그걸 쓰고 없으면 폴백"이라는 같은 규칙이 `toApiError`(ApiError에 status·retryable 보존), `readError`(문자열만 반환, status 소실), `callApi`의 인라인 `new Error(data.error || failure)`(ApiError 아예 안 씀)로 세 번 구현돼, 같은 실패라도 재시도 안내와 401 리다이렉트 붙는지가 홀마다 달라진다. use-social-alerts의 쓰기/삭제 실패는 status를 잃어 다른 길드 훅과 달리 401 시 로그인 안내가 없다.
- 근거:

```ts
async function readError(res: Response, fallback: string): Promise<string> {
	const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
	return typeof payload?.error === "string" && payload.error.trim() ? payload.error : fallback;
```

- 제안: `readError`와 `callApi`의 추출 로직을 `toApiError(res, fallback)` 호출로 바꾸고 message만 꺼내 쓰게 해 재시도/401 계약을 한 곳으로 모은다.

### 2. [MEDIUM] data-api 클라이언트 안에서 실패 메시지 추출 블록 3회, 키 미설정 가드 4회가 복제된다

- 위치: apps/dashboard/src/lib/data-api/client.ts:118 (동일 블록 :157, :212), apps/dashboard/src/lib/data-api/client.ts:17 (동일 가드 :99, :145, :197)
- 규칙: 감사 기준 2 (AI 코드 슬롭: 헬퍼 중복)
- 사유: `res.json().catch(() => null)` 후 `message` 유효성 검사 후 `{ok:false, status, message}` 반환하는 10줄 블록이 forwardDataApiPost/Get/Image에 그대로 복사돼 있고, 인증 키 미설정 시 동일 문자열 경고 후 503을 돌려주는 가드도 4곳에 복제된다. 게다가 postDataApi(:69)와 openDataApiStream(:46)은 같은 미설정 경로에서 경고 없이 조용히 null을 돌려 로깅이 들쭉날쭉하다.
- 근거:

```ts
const payload = (await res.json().catch(() => null)) as {
  message?: unknown;
} | null;
```

- 제안: `requireDataApi()`(키 확인 + 경고 + 503 실패 봉투)와 `readForwardFail(res)` 헬퍼를 파일 안에 두고 7개 지점에서 호출하게 바꾼다.

### 3. [MEDIUM] 캐시 TTL 판정이 같은 파일 안에서 두 번 계산된다

- 위치: apps/dashboard/src/lib/guild-permissions.ts:60 (writeCache 내부 삼항), apps/dashboard/src/lib/guild-permissions.ts:89 (cacheTtlMs)
- 규칙: 감사 기준 2 (AI 코드 슬롭: 중복 로직)
- 사유: 결과별 TTL(ok 60초, unavailable 10초, invalid-token 0) 매핑이 `writeCache` 안의 삼항과 `cacheTtlMs` 함수에 똑같이 구현돼 있다. 한쪽 주석(:88)이 "인메모리 writeCache와 동일해요"라고 따라 쓰고 있을 만큼 값이 어긋나면 인메모리와 Redis 캐시 수명이 갈라진다.
- 근거:

```ts
const ttl =
  result.status === "ok"
    ? OK_CACHE_TTL_MS
```

- 제안: `writeCache`의 삼항을 `cacheTtlMs(result)` 호출로 교체해 TTL 원본을 한 곳으로 줄인다.

### 4. [MEDIUM] zod 본문 검증 400 흐름이 두 구현으로 갈리고 미등록 키 처리가 달라진다

- 위치: apps/dashboard/src/lib/api-handler.ts:127, apps/dashboard/src/lib/schemas.ts:150 (parseSettingBody)
- 규칙: 감사 기준 2 (AI 코드 슬롭: zod 검증 헬퍼 중복)
- 사유: "JSON 파싱 실패 → safeParse → zodError로 400 응답"의 핵심이 api-handler의 schema 분기와 parseSettingBody에 각각 구현돼 있고, parseSettingBody는 미등록 키를 400으로 거절하는데(:160) api-handler 경로는 검사조차 없다. schema 옵션을 쓴 라우트와 parseSettingBody를 쓴 라우트 사이에 본문 계약이 실제로 어긋난다.
- 근거:

```ts
const parsed = options.schema.safeParse(await request.json().catch(() => null));
if (!parsed.success) {
	return NextResponse.json({ error: options.invalidMessage ?? zodError(parsed.error) }, { status: 400 });
```

- 제안: api-handler의 schema 분기도 `parseSettingBody(request, schema, allowedKeys)`를 부르게 해 미등록 키 검사까지 경로를 하나로 합친다.

### 5. [MEDIUM] SWR fetcher가 두 구현으로 갈리고 한쪽은 영문 에러 메시지를 던진다

- 위치: apps/dashboard/src/lib/fetcher.ts:3, apps/dashboard/src/lib/swr.ts:38 (createApiFetcher)
- 규칙: 감사 기준 2 (fetcher 헬퍼 중복), 감사 기준 3 (유저 대상 문자열 일관성)
- 사유: 전역 SWR 기본 fetcher는 단순 `fetch + !ok throw`로 영문 메시지를 던지고, 공용 팩토리인 createApiFetcher는 서버의 한국어 메시지를 담은 ApiError를 던져 fetcher를 명시적으로 안 넘긴 useSWR(예: use-playlists의 상세·검색 조회)은 실패 시 ApiError 계약 밖 영문 메시지가 흘러간다. 같은 앱에서 실패 문구의 출처가 두 개다.
- 근거:

```ts
export async function fetcher<T = unknown>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Network response was not ok");
```

- 제안: 전역 기본 fetcher도 `toApiError(res, fallback)`을 쓰게 하고, 이중 구현을 createApiFetcher 한 곳으로 모은다 (단, 화면 표시 여부는 components/ 범위 밖이라 추가 확인 필요).

### 6. [MEDIUM] 프로필 집계 수치의 샘플링 한도가 일부 통계에만 고지된다

- 위치: apps/dashboard/src/lib/profile-stats.ts:86 (샘플 상수), apps/dashboard/src/lib/profile-stats.ts:172 (rps 승패 집계), apps/dashboard/src/lib/profile-stats.ts:201 (listenSampled)
- 규칙: 감사 기준 4 (R-17 출처 확인)
- 사유: 청취 시간은 500건 샘플임을 알리는 `listenSampled` 플래그가 있는데(:201), 가위바위보 승/패/연승은 최근 5000건(:87, :123), 숫자맞추기 최소 시도는 최근 1000건(:88, :129)을 넘겨버리면 조용히 어긋나는데 고지 수단이 없다. 무출처 수치는 아니지만(모두 DB 실제 기록), 사용자에게 그대로 보이는 통계라 출처 확인 대상이다. 화면 표시 여부는 app/components가 범위 밖이라 미확인.
- 근거:

```ts
const LISTEN_SAMPLE_LIMIT = 500;
const RPS_SAMPLE_LIMIT = 5000;
const GUESS_SAMPLE_LIMIT = 1000;
```

- 제안: rps·guess 결과에도 `sampled` 플래그를 붙이거나 집계를 DB aggregate 쿼리로 바꿔 원본 전체 수치를 쓰게 한다.

### 7. [LOW] 함수 이름을 그대로 반복하는 주석이 두 줄 있다

- 위치: apps/dashboard/src/lib/discord-cdn.ts:1, apps/dashboard/src/lib/discord-cdn.ts:6
- 규칙: antislop-code "Restating the Obvious" (재서술)
- 사유: `discordAvatarUrl` 위의 "Build Discord CDN avatar URL"은 선언이 이미 말하는 것 외에 아무 정보도 더하지 않는 시그니처 반복이고, `discordGuildIconUrl` 위 주석도 같은 형식이다.
- 근거:

```ts
/** Build Discord CDN avatar URL */
export function discordAvatarUrl(userId: string, avatarHash: string, size = 128): string {
```

- 제안: size 기본값(128)처럼 코드에 없는 사실 하나를 남기거나 주석을 지운다.

### 8. [LOW] 주석이 존재하지 않는 옛 파일을 가리킨다

- 위치: apps/dashboard/src/lib/env.ts:23
- 규칙: antislop-code "Over-Explained Comment" (버전 히스토리/옛 참조 페널티)
- 사유: "기존 lib/data-api.ts와 동일"이라 적었지만 현재 트리에는 lib/data-api/ 디렉터리만 있고 lib/data-api.ts 파일은 없다. 다음 사람이 대조하려다 허무하게 검색부터 하게 되는 스테일 참조다.
- 근거:

```ts
// data-api 계약: 둘 중 하나만 있어도 동작. || 이라서 빈 문자열도 폴백해요 (기존 lib/data-api.ts와 동일).
```

- 제안: || 폴백이 빈 문자열까지 잡는 이유만 남기고 사라진 파일 참조를 삭제한다.

### 9. [LOW] 미사용 export와 내부 전용 export가 섞여 있다

- 위치: apps/dashboard/src/lib/discord-cdn.ts:2 (discordAvatarUrl 전소스 미사용), apps/dashboard/src/lib/schemas.ts:131 (unknownKeys 같은 파일에서만 사용), apps/dashboard/src/lib/token-store.ts:144, apps/dashboard/src/lib/token-store.ts:166, apps/dashboard/src/lib/token-store.ts:186
- 규칙: 감사 기준 2 (죽은 코드/미사용 export)
- 사유: `discordAvatarUrl`은 apps/dashboard/src 전체에서 정의부 외 참조가 없다(아바타 URL은 어디서도 쓰지 않고 아이콘 URL만 사용). `unknownKeys`와 token-store의 세 함수는 export돼 있지만 호출부가 전부 같은 파일 안이라 public 계약으로 보여주지 않는다.
- 근거:

```ts
export function unknownKeys(body: unknown, allowed: readonly string[]): string[] {
```

- 제안: 미사용인 `discordAvatarUrl`은 삭제(또는 사용처 추가), 내부 전용 함수는 export를 뺀다.

### 10. [LOW] 훅 11개 중 테스트가 1개뿐이고 lib 20개 모듈이 무테스트다

- 위치: apps/dashboard/src/hooks/use-playlists.ts:1 (테스트 없음, use-guild-settings 외 전부), apps/dashboard/src/lib/storage.ts:1, apps/dashboard/src/lib/notify.ts:1, apps/dashboard/src/lib/profile-stats.ts:1
- 규칙: 감사 기준 2 (테스트 누락, LOW)
- 사유: hooks는 use-guild-settings.test.tsx 하나만 있고, lib은 42개 비테스트 파일 중 20개(storage, notify, profile-stats, session-token, redis, auth, greeting-image, custom-commands 등)에 대응 테스트가 없다. 알림 문구·집계 로직·토큰 세션이 회귀해도 잡히지 않는 구간이다.
- 근거:

```text
hooks 미테스트 9개: use-social-alerts, use-playlists, use-member-greeting, use-bot-profile, use-guild-assets 외 4개
lib 미테스트 20개: storage, notify, profile-stats, session-token, redis, auth, greeting-image, custom-commands 외 12개
```

- 제안: 사용자 문구와 집계 수치를 직접 만드는 storage/notify/profile-stats 세 모듈부터 회귀 테스트를 먼저 붙인다.

### 11. [LOW] lib 레이어가 components 레이어를 임포트한다

- 위치: apps/dashboard/src/lib/notify.ts:3
- 규칙: 감사 기준 2 (잘못된 레이어 import)
- 사유: lib은 components가 참조하는 하위 레이어인데 notify.ts만 `@/components/ui/toast`를 올라타 역방향 참조가 된다. 현재 단방향이라 순환은 없지만, hooks/use-guild-assets와 use-playlists처럼 같은 토스트를 직접 쓰는 곳과 훅 레이어가 갈라진다.
- 근거:

```ts
import { toast } from "@/components/ui/toast";
```

- 제안: notify.ts를 hooks 디렉터리로 옮기거나, 토스트 호출을 인자로 받는 순수 헬퍼로 바꿔 lib이 UI 모듈을 모르게 한다.

## 검사했지만 문제 없는 항목

- 주석 슬롭 패턴 전수 검사: 구분선(=, - 반복 배너), TODO/FIXME, 장식 이모지, end marker, 단계 내레이션(Step/N번째/먼저·다음으로), 빈 라벨(Main logic, Helper function, Entry point), ALL CAPS 라벨 검색 결과 0건.
- 유저 대상 문자열(알림·에러·버튼 상수·zod 안내)의 em dash(U+2014) 포함 0건. 큰따옴표 문자열 안 대시 기호는 lib에 36건이 있으나 전부 테스트 describe/it 이름과 console.warn 로그였고 hooks는 0건이라 감사 기준 3의 범위 밖이다.
- 감사 기준 3의 나머지: 범용 CTA(시작하기/더 알아보기/Get Started), AI 버즈워드(seamless/혁신적/무제한/100%), 이모지 장식, 챗봇 클로저(도움이 되셨나요류) 검색 결과 0건.
- 감사 기준 4의 나머지 숫자: "최대 3MB"(greeting-image.ts:8 상수와 같은 수치), "최대 500개/15초/0.5초/99" 등 zod 메시지는 모두 같은 줄의 `.max/.min` 경계와 동일해 출처가 코드 안에 있다. rate-limit의 "분당 12회"류 주석도 같은 파일의 RateRule 상수를 가리킨다.
- R-27(UI 상태) 관련: 훅들이 전부 isLoading/error/null 데이터를 일관된 형태로 내보내 화면이 세 상태를 만들 재료를 갖췄다.
- R-32(키보드) 관련: lib/utils.ts:36 `radioArrowKeyDown`이 좌우 순환 키보드 이동을 공용으로 제공한다.
- format.ts의 상대시간 헬퍼 2개(formatRelativeTime, formatRelativeTimeFromISO)는 "방금 전" 표기(하트비트)와 "방금" 표기 + 7일 후 절대 날짜(재생 기록)로 표기 계약이 다르고 그 이유가 주석(:7, :16)에 적혀 있어 중복으로 보지 않는다.
- 스키마 이중 정의: GUILD_SETTING_KEYS/GuildSettings/GUILD_SETTINGS_DEFAULTS가 guildSettingsSchema shape에서만 파생되고(schemas.ts:73-77), 스키마 키·Prisma @default 일치를 테스트가 잠그고 있다.
- 주석이 실제 정보를 담는 구간(보존 대상): rate-limit.ts:26-31 Lua 시드/클록 오차, token-store.ts 전체의 뮤텍스·낙관 잠금 설명, guild-permissions.ts:42-46 단일 비행 사유, env.ts:3-13 재해석·fail-open 계약, auth.ts:13-14 issuer 검증 워크어라운드, redis.ts:118-121 Redlock 안전 해제. 모두 제거 대상이 아니다.


---

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


---

TOTAL: 27 (HIGH:9 MEDIUM:9 LOW:9)

# data-api services/providers/renderers/utils antislop 감사

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `apps/data-api/src/{services,providers,renderers,utils}/**` (renderers/canvas 포함). routes/plugins/config 제외.
- 감사 파일 수: 56 (비테스트 38 전문 검토 + 테스트 18 패턴 스캔)
- 방법: 주석·중복·죽은 코드는 전수 확인, 캔버스 텍스트 대비는 `/home/sunshine/.config/opencode/skills/antislop-human/contrast-check.py`로 산출한 수치로만 FAIL 판정. 알파 텍스트는 실제 합성 색으로 변환 후 측정. 코드·설정 변경 없음.

---

## findings

### 1. [HIGH] 인사 카드 에러 메시지 4곳에 em dash

- 위치: `apps/data-api/src/renderers/memberGreetingCard.ts:274` (동일 문자열이 281, 286, 304에도 있음)
- 규칙: R-02 (하드 게이트, 유저 대상 에러 문구)
- 사유: 라우트가 400 응답으로 그대로 노출하는 유저 대상 메시지에 U+2014이 들어 있다.
- 근거 (원본의 U+2014는 `\u2014`로 표기):

```ts
throw new GreetingBackgroundError('invalid_image', '이미지를 읽을 수 없어요 \u2014 PNG·JPEG·WEBP 파일로 다시 시도해 주세요.');
```

- 제안: 쉼표 또는 온점으로 교체(예: `이미지를 읽을 수 없어요. PNG·JPEG·WEBP 파일로 다시 시도해 주세요.`), 4개 문자열은 상수 하나로 추출.

### 2. [HIGH] LIVE 뱃지 흰 글씨 대비 3.48:1

- 위치: `apps/data-api/src/renderers/nowPlayingCard.ts:342`
- 규칙: R-25
- 사유: 14px 일반 텍스트(4.5:1 기준)가 3.48:1이라 미달, contrast-check.py 측정 결과 normal FAIL.
- 근거:

```ts
badgeX = drawPill(ctx, { x: badgeX, y: 32, icon: 'radio', label: 'LIVE', bg: '#ff3b5c', fg: '#ffffff' }) + 8;
```

- 제안: 뱃지 배경을 #d11f3f로 바꾸면 흰 글씨 5.28:1로 PASS(contrast-check.py 측정). 글씨 쪽을 바꿀 때도 4.5:1 확보 후 재측정.

### 3. [HIGH] 다크 프로필 헤더 `PROFILE` 라벨 대비 2.88~4.14:1

- 위치: `apps/data-api/src/renderers/profileCardDark.ts:216`
- 규칙: R-25
- 사유: 헤더 그라디언트 밝은 구간(#987bbd~#795f93) 위에 흰색 80% 17px 텍스트를 얹어 핸들 길이에 따라 2.88~4.14:1로 4.5:1 미달(27px 핸들 텍스트는 큰 글씨 기준으로 통과).
- 근거:

```ts
ctx.fillStyle = 'rgba(255,255,255,0.8)';
ctx.font = '600 17px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText('PROFILE', PAD + 58 + headW, 40);
```

- 제안: 라벨 불투명도를 1.0으로 올리고 그라디언트 시작색을 어둡게 조정하거나 라벨을 헤더 밖(다크 배경)으로 뺀 뒤 재측정.

### 4. [HIGH] 티켓 카드 본문 흐린 잉크(INK_MUTED) 3.47~3.60:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:253` (동일 색이 349, 398, 386 LIGHT_MUSIC_PAL.textMuted에도 사용)
- 규칙: R-25
- 사유: `rgba(63,58,53,0.62)`를 크림(#f3efe6) 위에서 합성하면 #837f78로 3.47:1, 카드(#fbf8f2) 위에서는 3.60:1로 15~22px 본문이 4.5:1 미달.
- 근거:

```ts
ctx.fillStyle = INK_MUTED;
ctx.font = '500 22px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText(tkHandle, nameX, handleBase + 8);
```

- 제안: 알파를 0.62에서 0.78로 올리면 크림 5.26:1, 카드 5.54:1로 PASS(측정 완료). 라이트 음악 팔레트도 같은 값으로 통일.

### 5. [HIGH] 티켓 카드 역할 캡슐 텍스트 2.31/3.25:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:57` (drawChip 호출은 298)
- 규칙: R-25
- 사유: 핑크 캡슐 2.31:1, 그린 캡슐 3.25:1로 16px 텍스트 4.5:1 기준에 크게 미달(3.0:1조차 핑크는 실패).
- 근거:

```ts
const CHIP_PINK_BG = '#e8d4d2';
const CHIP_PINK_TEXT = '#b97f7e';
const CHIP_GREEN_BG = '#d6e4da';
```

- 제안: 핑크 캡슐 글씨를 #7d4a49(5.01:1), 그린 캡슐 글씨를 #46614f(5.18:1)로 교체하면 PASS(측정 완료).

### 6. [HIGH] 티켓 카드 온라인 캡슐 라벨 3.60:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:280`
- 규칙: R-25
- 사유: `#5d7a66` 텍스트를 `#d6e4da` 배경에 16px로 그려 4.5:1 미달.
- 근거:

```ts
ctx.fillStyle = SAGE_MID;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
```

- 제안: SAGE_MID 대신 SAGE_DEEP(#4f6a58)을 쓰면 같은 배경에서 4.52:1로 PASS(측정 완료).

### 7. [HIGH] 티켓 카드 헤더·푸터 로즈 텍스트 1.93/2.73:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:223` (푸터 0.8 버전은 369)
- 규칙: R-25
- 사유: 알파 0.55 로즈가 크림에서 1.93:1, 알파 0.8도 2.73:1로 큰 글씨 기준(3.0:1)마저 실패하는 최저 수치.
- 근거:

```ts
ctx.fillStyle = 'rgba(169, 106, 100, 0.55)';
ctx.font = '600 17px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText(`${input.profileId.toUpperCase()} / MEMBER PASS`, PAD, 36);
```

- 제안: `#a96a64`는 같은 크림에서 3.71:1로 여전히 미달이므로 `#8f544e`(5.16:1, 측정 완료) 이하의 어두운 로즈로 교체하고 17px 기준 4.5:1을 재확인.

### 8. [HIGH] 티켓 스텁 `PERSONAL PROFILE` 라벨 2.33~2.58:1

- 위치: `apps/data-api/src/renderers/profileCardTicket.ts:211`
- 규칙: R-25
- 사유: `rgba(79,106,88,0.75)` 15px 텍스트를 세이지(#bfd3c5) 위에서 합성하면 2.58:1, 우측 그라디언트가 밝아진 구간에서는 2.33:1로 4.5:1 미달.
- 근거:

```ts
ctx.fillStyle = 'rgba(79, 106, 88, 0.75)';
ctx.font = '600 15px "Pretendard JP", "Twemoji Mozilla", ui-sans-serif, sans-serif';
ctx.fillText('PERSONAL PROFILE', stubCx, H2 - 40);
```

- 제안: `#4f6a58`로 바꿔도 3.77:1로 미달이므로 `#3d5245`(세이지 위 5.35:1, 그라디언트 밝은 구간 5.60:1, 측정 완료) 같은 값으로 교체하고 라벨 크기도 14px 이상으로.

### 9. [HIGH] 티켓 프리셋 로즈 액센트 라벨·랭크 배지 4.02:1

- 위치: `apps/data-api/src/renderers/profileWidgets.ts:95` (색은 profileCardTicket.ts:60 ACCENT_ROSE)
- 규칙: R-25
- 사유: 공용 위젯의 `지금 재생 중`(17px), `자주 신청한 곡`(18px), 랭크 숫자(12px)가 티켓 카드에서 4.02:1로 4.5:1 미달. 같은 위젯을 다크 프로필이 쓸 때는 8.76:1이라 티켓 프리셋 한정 문제.
- 근거:

```ts
ctx.fillStyle = pal.accent;
ctx.font = '700 17px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.fillText('지금 재생 중', labelX + 26, cy + 41);
```

- 제안: `LIGHT_MUSIC_PAL.accent`를 카드 위 5.59:1인 `#8f544e`(측정 완료) 같은 값으로 교체하고 랭크 배지 배경색도 함께 재조정.

### 10. [MEDIUM] 렌더러 주석의 `── 라벨 ──` 박스 수미선 섹션 헤더 47건

- 위치: `apps/data-api/src/renderers/profileCardDark.ts:151`
- 규칙: antislop-code, 장식 구분선 (체크리스트: box-drawn headers)
- 사유: `── 배경 ──`처럼 반복 문자로 감싼 섹션 이름이 renderers 비테스트 파일에 47건(profileCardDark 15, profileCardTicket 14, nowPlayingCard 9, ohaasaCard 6, profileWidgets 2, memberGreetingCard 1) 있으며 장식이 메시지다.
- 근거:

```ts
// ── 배경 ──
ctx.fillStyle = PAL.page;
ctx.fillRect(0, 0, W, H);
```

- 제안: 장식 기호만 제거해 한 줄 평문으로 바꾸고, 제약·근거가 함께 적힌 주석은 문구를 유지.

### 11. [MEDIUM] 가사 정규식이 주석과 다른 파일에 다시 적혀 있음

- 위치: `apps/data-api/src/providers/lyrics.ts:15`
- 규칙: ai-slop-cleaner, 중복(정규화 로직 복붙)
- 사유: 7행의 `STRIP_PARENS`를 쓰겠다는 주석이 있는 파일 안에서 fetchLyrics가 같은 정규식 리터럴을 다시 쓰고, 소문자 변환까지 달라 `같은 규칙`이라는 설명과 어긋난다.
- 근거:

```ts
const STRIP_PARENS = /\(.*?\)|\[.*?\]/g;
// ...
const q = query.replace(/\(.*?\)|\[.*?\]/g, '').trim();
```

- 제안: `query.replace(STRIP_PARENS, '').trim()`으로 통일하고 소문자 적용 여부를 주석에 한 줄로 명시.

### 12. [MEDIUM] 주소 접미사 정규식이 weather와 weatherLocality에 이중 정의

- 위치: `apps/data-api/src/providers/weatherLocality.ts:340`
- 규칙: ai-slop-cleaner, 중복(정규화 로직 복붙)
- 사유: `/(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$/` 리터럴이 weather.ts:81과 동일하게 중복되어 접미사 규칙이 바뀌면 두 곳을 같이 고쳐야 한다.
- 근거:

```ts
const noMetroSuffix = originalQuery.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구|도)$/, '');
const hit2 = KR_TO_EN_QUERY[stripNoise(noMetroSuffix)];
```

- 제안: 접미사 정규식을 weatherLocality 쪽에 상수로 두고 weather.ts가 import해 단일 소스화.

### 13. [MEDIUM] request/reply 허브 상관 로직 축이 3파일에서 반복

- 위치: `apps/data-api/src/services/guildDataHub.ts:53`
- 규칙: ai-slop-cleaner, 중복
- 사유: JSON 파싱 → 스키마 safeParse → 메타 비교 → 메타 정리 → 결과 resolve 흐름이 playerWebHub.ts:64, jtcSetupHub.ts:42에도 같은 뼈대로 복붙돼 있다(공용 풀·구독 라이프사이클은 이미 분리된 상태에서 상관 본체만 남아 반복).
- 근거:

```ts
export function correlateGuildDataResponse(
	raw: string,
	pending: PendingRequestPool<GuildDataResult>,
```

- 제안: 스키마·메타 비교기·결과 매핑만 인자로 받는 공용 correlate 헬퍼로 합치고 파일별 차이(에러를 timeout으로 매핑하는 규칙 등)는 콜백으로 남길 것.

### 14. [MEDIUM] providers fetch 타임아웃 관례가 제각각이고 chapters만 없음

- 위치: `apps/data-api/src/providers/chapters.ts:77`
- 규칙: ai-slop-cleaner, 중복(HTTP 클라이언트)
- 사유: weather/delivery는 AbortController 조합, embedFix/lyrics/lavalink/ohaasa/translate/images는 `AbortSignal.timeout`을 쓰는데 chapters의 두 fetch(search 77행, watch 109행)에는 타임아웃 신호가 없다.
- 근거:

```ts
const response = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
	method: 'POST',
```

- 제안: 공용 `fetchText/fetchJson`(타임아웃 인자 포함) 헬퍼를 utils에 두고 providers가 쓰게 한 뒤 chapters에도 적용.

### 15. [MEDIUM] 미사용 상수가 packages/utils의 동일 상수와 이중 정의

- 위치: `apps/data-api/src/providers/chapters.ts:13`
- 규칙: ai-slop-cleaner, 죽은 코드 + 중복
- 사유: `CHAPTER_FETCH_MIN_DURATION_MS`는 저장소 전체에서 정의만 존재하고 data-api 내부 소비처가 없으며, 값이 같은 상수가 `packages/utils/src/lavalinkTrack.ts:7`에도 있다.
- 근거:

```ts
/** 장문 영상에서만 챕터가 의미 있으므로 이 미만은 조회하지 않는다. */
export const CHAPTER_FETCH_MIN_DURATION_MS = 15 * 60 * 1000;
```

- 제안: data-api 정의를 지우고 `@sirubot/utils`의 상수를 import하거나, 쓰는 곳이 생길 때까지 export도 함께 제거.

### 16. [MEDIUM] 별밭 주석이 실제 동작과 반대

- 위치: `apps/data-api/src/renderers/ohaasaCard.ts:51`
- 규칙: antislop-code, 재서술(코드와 다른 설명)
- 사유: 주석은 시드 없이 매번 다르다고 적지만 실제로는 108행에서 별자리 코드로 시드를 고정해 같은 별자리 카드끼리는 별밭이 동일하다.
- 근거:

```ts
drawStarfield(ctx, W, H, Number(input.zodiacCode) * 7919);
```

- 제안: 주석을 `별자리별 시드 고정이라 같은 별자리 카드는 같은 별밭`(또는 시드를 requestId 기반으로 바꿔 카드별 개성을 살림)으로 정정.

### 17. [MEDIUM] 라벨과 무관한 제네릭 아이콘에 근거 없음

- 위치: `apps/data-api/src/renderers/ohaasaCard.ts:85`
- 규칙: R-04 (퍼포즈 게이트)
- 사유: `행운의 열쇠` 라벨에 별 아이콘을 쓰는 근거가 코드에 없고, sparkle/star는 R-04의 제네릭 목록에 든다(추천 뱃지 sparkle도 nowPlayingCard.ts:352에서 같은 문제).
- 근거:

```ts
if (key) boxes.push({ label: '행운의 열쇠', value: key, icon: 'star' });
```

- 제안: lucide `key` 경로를 아이콘 DB에 추가해 라벨과 일치시키거나, 아이콘을 쓰는 이유를 한 줄로 남길 것.

### 18. [MEDIUM] 프로필 카드 미사용 export와 팔레트 필드

- 위치: `apps/data-api/src/renderers/profileWidgets.ts:21`
- 규칙: ai-slop-cleaner, 죽은 코드/미사용 export
- 사유: `CardPalette` 14필드 중 page, chip, chipText, textFaint, online, separator 6필드를 드로잉 코드가 읽지 않고, `ZODIAC_THEMES`(ohaasaCard.ts:17)와 `CARRIER_ALIASES`(delivery.ts:26)도 외부 소비처가 없다.
- 근거:

```ts
export interface CardPalette {
	page: string;
	card: string;
```

- 제안: 미사용 필드와 export 키워드를 제거해 계약을 실제 사용 범위와 맞출 것.

### 19. [LOW] 운영자 로그 문자열에도 em dash

- 위치: `apps/data-api/src/renderers/canvas/fonts.ts:40`
- 규칙: R-02 (유저 대상이 아닌 로그라 우선순위 하향)
- 사유: `logger.warn` 문자열 4곳(fonts.ts:40·48, jtcSetupHub.ts:64, guildDataHub.ts:75, playerWebHub.ts:86)에 U+2014이 들어 있다.
- 근거 (원본의 U+2014는 `\u2014`로 표기):

```ts
logger.warn('PretendardJPVariable.ttf를 찾지 못했어요 \u2014 카드 텍스트가 시스템 폰트로 폴백해요.');
```

- 제안: 로그도 같은 규칙으로 쉼표/온점 교체(콘솔 가독성에도 이득).

### 20. [LOW] 카드 랭크 배지 숫자 12px로 최소 크기 기준 미달

- 위치: `apps/data-api/src/renderers/profileWidgets.ts:165`
- 규칙: 캔버스 글자 크기 기준(본문 14px 미만 금지)
- 사유: 카드에서 가장 작은 텍스트인데 12px이며 숫자라 한글 본문은 아니지만 동일 기준의 하한에 걸린다(같은 배지가 다크 프로필에서는 대비 9.59:1로 색은 통과).
- 근거:

```ts
ctx.font = '800 12px "Pretendard JP", "Twemoji Mozilla", sans-serif';
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
```

- 제안: 배지를 14px에 맞춰 키우거나 배지 크기(22px)를 함께 조정.

### 21. [LOW] 테스트 없는 모듈이 20개 이상

- 위치: `apps/data-api/src/providers/weather.ts`
- 규칙: ai-slop-cleaner, 테스트 누락(LOW)
- 사유: providers(weather·delivery·lyrics·chapters·lavalinkSearch·ohaasa·weatherLocality), services(memoryTidy·ohaasaScheduler·db), utils(hubSubscriber·metrics·parseClock), renderers(profileCardDark·profileCardTicket·profileWidgets·canvas/fonts)에 대응 테스트가 없다.
- 근거:

```ts
export async function fetchWeather(location: string, scope: WeatherScope = 'now'): Promise<WeatherResult> {
```

- 제안: 사용자 메시지와 캔버스 출력에 직접 영향을 주는 weather/delivery 프로바이더와 두 프로필 카드 스모크 테스트부터 우선 추가.

### 22. [LOW] 코드와 다른 주석이 두 곳

- 위치: `apps/data-api/src/renderers/nowPlayingCard.ts:410`
- 규칙: antislop-code, 재서술/미갱신
- 사유: 제목 주석(406행)은 줄 바꿈 없이 그린다고 적지만 실제로는 최대 2줄로 줄바꿈하며, canvasUtils.ts:9 표에는 shapes.ts에 없는 `색 보간`이 적혀 있다.
- 근거:

```ts
const titleLines = wrapText(ctx, input.title, textW, 2);
```

- 제안: 두 주석을 실제 동작(2줄 줄바꿈, 색 변환은 hexToRgba 재수출)에 맞게 수정.

### 23. [LOW] JSDoc이 위 상수를 문자열로 다시 씀

- 위치: `apps/data-api/src/renderers/memberGreetingCard.ts:311`
- 규칙: antislop-code, 시그니처/상수 재서술
- 사유: 바로 위 247~251행에 이름 붙은 상수(900_000, 1600, 0.82, 200)를 산문으로 반복해 값이 바뀌면 문서가 어긋난다(318~321행도 같은 패턴).
- 근거:

```ts
const IMAGE_MAX_BYTES = 900_000;
const IMAGE_STEP_PX = 200;
const BG_MAX_SIDE = 1600;
```

- 제안: JSDoc에서 숫자를 빼고 상수명을 가리키거나(예: `IMAGE_MAX_BYTES 상한, IMAGE_STEP_PX만큼 축소`), 한 곳만 유지.

### 24. [LOW] 같은 카드 안에서 브랜드명 fallback이 두 가지

- 위치: `apps/data-api/src/renderers/nowPlayingCard.ts:511`
- 규칙: R-16 (카피 일관성)
- 사유: brandLine이 없을 때 중간 라인은 `SiruBOT`, 하단 푸터는 `시루봇`으로 그려 같은 이미지에 두 이름이 함께 나온다(518행).
- 근거:

```ts
ctx.fillText('SiruBOT', tx, metaY);
// ...
ctx.fillText(input.brandLine ?? '시루봇', right, H - 22);
```

- 제안: fallback 값을 한 상수로 통일(운세 카드는 `SiruBOT`을 쓰므로 어느 쪽으로 맞출지 결정 필요).

### 25. [LOW] 별자리 맵이 봇과 이중 정의(기존 유지 판정 있음)

- 위치: `apps/data-api/src/providers/types.ts:4`
- 규칙: ai-slop-cleaner, 중복
- 사유: `apps/bot/src/modules/games/utils/ohaasaService.ts:2`와 같은 12항목 맵이 복제돼 있고 주석도 봇과 동일하다고 적어 두었다(docs/refactor-plan.md는 유지로 판정한 상태).
- 근거:

```ts
export const ZODIAC_MAP: Record<string, { jp: string; ko: string; en: string }> = {
	'01': { jp: 'おひつじ座', ko: '양자리', en: 'Aries' },
```

- 제안: 판정 유지라면 이중 정의 위치를 문서에 남기고, 판정을 바꿀 때는 `@sirubot/utils`로 옮겨 봇·data-api 모두 import하게 할 것.

### 26. [LOW] 메모리 정리가 번역 인터페이스가 아닌 구현체 타입에 결합

- 위치: `apps/data-api/src/services/memoryTidy.ts:14`
- 규칙: ai-slop-cleaner, 잘못된 레이어/불필요 결합
- 사유: 같은 패키지에 `TranslationProvider` 인터페이스가 있는데도 `chatCompletion`이 인터페이스에 없어 구현체 클래스 타입을 직접 받아 의존이 굳는다.
- 근거:

```ts
import type { OpenAICompatTranslationProvider } from '../providers/translate.ts';
```

- 제안: `chatCompletion`을 공용 인터페이스(또는 별도 LLM 클라이언트 인터페이스)로 올리고 서비스는 인터페이스만 받게.

### 27. [LOW] ohaasa 갱신 완료 처리 4줄 블록 3회 반복

- 위치: `apps/data-api/src/services/ohaasaScheduler.ts:41`
- 규칙: ai-slop-cleaner, 중복(경미)
- 사유: `lastGood/lastRefreshAt/lastSource` 대입과 `sharedCache.set` 4줄 조합이 41, 54, 62행에 거의 같은 형태로 반복된다.
- 근거:

```ts
lastGood = raw;
lastRefreshAt = Date.now();
lastSource = 'raw';
```

- 제안: `commit(daily, source)` 헬퍼를 함수 상단에 두고 세 경로가 공유하게.

---

## 검사했지만 문제 없는 항목

- R-02 (카드에 그리는 문자열): `NOW PLAYING`, `LIVE`, `일시정지`, `봇 추천`, `다음 곡`, `오늘의 운세`, `SiruBOT` 등 렌더러 출력 문자열에 em dash 없음. 유저 대상 에러 문구(weather 6종, delivery 8종)도 em dash·비속어·과장 표현 없음.
- 챗봇 클로저: 범위 내 유저 메시지에 `도움이 되셨나요`, `말씀해 주세요` 같은 클로저 없음. 지시형(`잠시 후 다시 시도해 주세요`, `다른 이름으로 다시 시도해 주세요`)만 사용.
- R-16/R-36: 버즈워드(혁신적·심리스·최고급 등), 근거 없는 성능·보안 주장 없음.
- R-17/R-38: 카드에 찍히는 수치(대기열 곡 수, 볼륨, 소요 시간, 순위, 가입·합류 날짜, 트랙 목록)는 전부 입력 데이터 출처이며 하드코딩된 통계·집계·가상 이름 없음. 브랜드명도 실제 제품명.
- R-18: 후기·평점·사용자 명단 섹션 없음.
- R-25 통과 조합 (contrast-check.py): 다크 프로필 본문 #b6aec4 on #221a30 = 7.82:1, 칩 #cabdf2 on #2a2136 = 8.82:1, 푸터 흐린 텍스트 5.64:1, nowPlaying 하단 메타 합성색 6.02~6.22:1, 운세 카드 라벨 #c9a8b5 on #1a0e12 = 8.74:1, 다크 프로필 랭크 배지 9.59:1, 온라인 캡슐 10.63:1, 다크 프로필 헤더 핸들(27px 큰 글씨) 3.56~7.50:1.
- R-03/R-24/R-26/R-32/R-34: 캔버스 정적 이미지라 반응형 레이아웃·내비게이션·키보드 조작·포커스 아웃라인·테마 토글 비대상. 클릭 가능한 요소 없음.
- R-27: 정적 이미지지만 상태 대체는 존재(아트워크 없을 때 바이닐 폴백, 아바타 실패 시 음표 플레이스홀더, 럭키 정보 부재 시 `오늘의 럭키 정보가 없어요`).
- R-04 통과분: 캘린더·유저·리스트·볼륨·반복·트로피·디스크 등 라벨과 의미가 일치하는 lucide 아이콘은 근거 충분. 다크 프로필의 sparkle은 파일 머리글에 RINE 로고 모티프로 목적이 적혀 있다.
- R-01/R-29 팔레트: 프리셋별 팔레트는 `RINE 샘플 기준`, `크림/세이지 팔레트` 등 출처가 주석에 있고 카드당 강조색은 1개(도미넌트 컬러 또는 프리셋)라 다색 남용 없음. 하드코딩 값 자체는 있으나 디자인 토큰 공유 여부는 별도 결정 사항.
- 그 밖의 주석 슬롭: 모호 TODO/FIXME 0건, 장식 이모지 0건, end marker 0건, 단계 번호 내레이션(Step 1/2) 0건, 빈 라벨(`// Main logic`) 0건. 서명 검증(SEC-006), 타임아웃 매핑, 회로 브레이커 오염 방지, 폰트·UA 제약처럼 보안·프로토콜·엣지케이스 주석은 보존 대상으로 분류했다.
- 죽은 코드: `decodeDataUri`, `drawPresetBackground`, `inflightCount`, `recentPlaybackEvents`, `isAllowedImageUrl` 등 export는 라우트·테스트에서 소비처를 확인했다. `positionMs`, `trackUrl` 미사용은 스키마 호환용 주석이 있는 의도적 유지다.


---

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


---

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


---

TOTAL: 9 (HIGH:1 MEDIUM:3 LOW:5)

# 14. notifier 앱 antislop 감사

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `apps/notifier/src/**`
- 감사 파일 수: 34 (소스 20, 테스트 14)
- 읽기 전용 감사. 코드·설정·테스트는 수정하지 않음.
- 참고: 이 리포트의 근거 스니펫에서 em dash 문자는 `[em dash]`로 표기했다 (리포트 자체도 R-02 준수).

## findings

### 1. [HIGH] 유저가 보는 웹훅 표시 기본값에 em dash 사용 (R-02)

- 위치: `apps/notifier/src/routes/social.ts:143`
- 규칙: R-02 (하드 게이트, 문자 단위 금지)
- 사유: 구독 생성 시 커스텀 이름이 없으면 이 문자열이 Discord 웹훅 표시명이 되고 길드 채널의 모든 알림 메시지에 그대로 노출된다. 감사 기준 1이 강제하는 "유저 대상 문자열"에 직접 해당하며, 이 모듈에서 유저 대상 em dash는 이 건이 유일하다.
- 근거:
  ```
  name: body.webhookName ?? `시루 소셜 알림 [em dash] ${body.sourceName}`.slice(0, 80)
  ```
- 제안: 구분자를 쉼표 또는 화살표 없는 조합으로 바꾼다 (예: `시루 소셜 알림: ${body.sourceName}`). 80자 절단 로직은 그대로 둔다.

### 2. [MEDIUM] 모듈 로거·에러 문자열에 em dash가 반복 사용 (R-02 운영자 대상 확산)

- 위치: 대표 5곳 `apps/notifier/src/services/db.ts:12`, `apps/notifier/src/services/db.ts:21`, `apps/notifier/src/services/chzzkPoller.ts:78`, `apps/notifier/src/services/youtubeWebSub.ts:98`, `apps/notifier/src/index.ts:42` (주석까지 포함하면 전체 164줄)
- 규칙: R-02 (하드 게이트), 우선순위는 대상이 유저가 아닌 운영자 문자열이라 MEDIUM으로 책정
- 사유: "X가 안 돼요 [em dash] Y를 해요" 형식이 로그·예외 문자열에 고정 패턴으로 박혀 있다. 유저 대상은 아니지만 이 문자가 이 모듈의 기본 구두점 습관이라 finding 1의 재발 방지 관점에서 함께 정리 대상이다.
- 근거 (괄호 안이 em dash):
  ```
  logger.warn('REDIS_URL이 없어요 [em dash] 메모리 폴백으로 동작해요 (단일 인스턴스만 지원).');
  if (!channelId) throw new Error('채널 ID(UC...)를 찾지 못했어요 [em dash] 입력값을 확인해 주세요.');
  ```
- 제안: 문자열 상수·리터럴만 쉼표/마침표로 기계적 치환한다. 주석의 같은 표기는 내용과 무관하므로 같은 커밋에서 일괄 치환해도 된다. 로그 문구의 이유·제약 설명 내용은 보존한다.

### 3. [MEDIUM] chzzkApi 섹션 구분 주석에 박스 문자 장식 (주석 슬롭: 장식 구분선)

- 위치: `apps/notifier/src/services/chzzkApi.ts:81`, `apps/notifier/src/services/chzzkApi.ts:118`
- 규칙: antislop-code "Decorative Separators"
- 사유: 섹션 이름을 가로선으로 감싼 장식이 정보가 아니라 장식 자체가 신호다. 괄호 안 설명(실측 근거, 호출 시점)은 정보라 보존해야 한다.
- 근거 (가로선은 U+2500 박스 문자):
  ```
  // ── 라이브 섬네일 (polling v2 live-status는 liveImageUrl을 주지 않음 [em dash] 2026-10 실측, live-detail에서 보완) ──
  // ── 채널 검색·프로필 (대시보드 구독 추가용 [em dash] 관리자 수동 검색 시에만 호출돼요) ──
  ```
- 제안: 앞뒤 `──`만 제거하고 괄호 설명이 붙은 한 줄 주석으로 남긴다.

### 4. [MEDIUM] 사용되지 않는 export `getDb` (죽은 코드)

- 위치: `apps/notifier/src/services/db.ts:34`
- 규칙: ai-slop-cleaner "죽은 코드/미사용 export"
- 사유: 앱 전체에서 `services/db.ts`를 임포트하는 곳은 `index.ts:5`뿐이고 거기는 `connectDb`/`disconnectDb`만 가져온다. 나머지 `getDb`는 모두 주입받는 옵션 클로저(`() => db`)라 모듈 export는 어디서도 참조되지 않는다.
- 근거:
  ```
  export function getDb(): PrismaClient | null {
      return db;
  }
  ```
- 제안: `getDb` export를 제거한다. 모듈 전역 `db` 변수와 `connectDb`/`disconnectDb`는 그대로 둔다.

### 5. [LOW] 유튜브 스케줄러 단계 주석의 ①② 번호 표식 (주석 슬롭: 단계 내레이션 기미)

- 위치: `apps/notifier/src/services/youtubeScheduler.ts:78`, `apps/notifier/src/services/youtubeScheduler.ts:102`
- 규칙: antislop-code "Workflow Narration"
- 사유: 두 블록의 설명 자체는 lease 갱신 조건과 RSS 감사 목적이라 유효하다. 다만 `①`/`②` 접두어만 단계 체크리스트를 연출하는 장식이며 제거해도 정보 손실이 없다.
- 근거:
  ```
  // [circle-1] WebSub lease 갱신 [em dash] 만료 임박 토픽만 재등록해요 (푸시가 켜져 있을 때만)
  // [circle-2] RSS 감사 [em dash] WebSub 재전송이 없어서 놓친 영상을 저빈도 폴링으로 회수해요 (dedup가 중복을 막아요)
  ```
- 제안: 번호 표식만 뺀다. 문장 내용과 위치는 유지한다.

### 6. [LOW] 모듈 내부 전용 타입·상수의 public export 5건 (미사용 export)

- 위치: `apps/notifier/src/services/youtubeWebSub.ts:11` (`YOUTUBE_HUB_URL`), `apps/notifier/src/services/youtubeWebSub.ts:20` (`uploadsFeedUrl`), `apps/notifier/src/services/dispatcher.ts:23` (`SocialEmbed`), `apps/notifier/src/services/dispatcher.ts:34` (`SocialWebhookPayload`), `apps/notifier/src/services/dispatcher.ts:44` (`WebhookFetchFn`), 참고로 `apps/notifier/src/services/chzzkPoller.ts:29` (`PolledChzzkChannel`)도 파일 밖에서 참조되지 않는다
- 규칙: ai-slop-cleaner "미사용 export"
- 사유: grep 결과 이 6개는 선언 모듈 안에서만 참조되고 테스트도 임포트하지 않는다. 노출 폭이 실제 사용 범위보다 넓다. 단 `TwitchFetchFn`(twitchApi.ts:6)은 테스트가 쓰므로 제외했다.
- 근거:
  ```
  export const YOUTUBE_HUB_URL = 'https://pubsubhubbub.appspot.com/';
  export function uploadsFeedUrl(channelId: string): string {
  ```
- 제안: `export` 한정자를 제거한다. 공용이 되면 다시 붙여도 된다.

### 7. [LOW] Redis JSON 상태 로드/저장 패턴 3회 중복 (중복 로직, 경미)

- 위치: `apps/notifier/src/services/chzzkPoller.ts:140`~`154`, `apps/notifier/src/services/twitchScheduler.ts:89`~`103`, `apps/notifier/src/services/youtubeScheduler.ts:124`~`133`
- 규칙: ai-slop-cleaner "중복"
- 사유: 세 곳 모두 "raw get → JSON.parse → 필드 타입 검증 → 실패 시 null", 저장은 "set + TTL"의 같은 10줄 구조다. 다만 검증하는 필드 형태가 각각 달라(scheduler는 subscriptionId/createdAt, poller는 isLive/lastPolledAt, lease는 leaseUntil) 공용 헬퍼로 묶으면 검증부가 오히려 흐려질 수 있다. 경미해 LOW로 분류한다.
- 근거:
  ```
  const raw = await this.options.redis.get(twitchSubscriptionStateKey(broadcasterId));
  if (!raw) return null;
  try { const parsed = JSON.parse(raw) as SubscriptionState; ... }
  ```
- 제안: 지금은 유지해도 된다. 공용 헬퍼(`readJsonState<T>(key, validate)`)를 만들려면 검증 함수 주입 방식으로만 통합하고, 필드 검증은 도메인에 남긴다.

### 8. [LOW] fail-closed 키 검증 경로에 테스트 없음 (테스트 누락)

- 위치: `apps/notifier/src/config/env.ts:37`~`44` (테스트 파일 `config/env.test.ts` 부재)
- 규칙: ai-slop-cleaner "테스트 누락" (LOW)
- 사유: `validateEnv`의 보안 결정 지점(키 없으면 `process.exit(1)`)이 어느 테스트에도 잠겨 있지 않다. 서버 계약(server.test.ts)과 라우트 인증은 테스트돼 있으나 기동 전 단계만 비어 있다.
- 근거:
  ```
  if (!env.notifierAuthKey) {
      console.error('...');
      process.exit(1);
  ```
- 제안: `NOTIFIER_AUTH_KEY`/`AUTH_KEY` 모두 없을 때 종료하고, 한쪽만 있을 때는 `authKeyChain` 폴백이 동작하는지 주입 가능한 형태로 검증하는 테스트를 추가한다.

### 9. [LOW] 기동 실패 안내 문자열의 장식 이모지 (R-04)

- 위치: `apps/notifier/src/config/env.ts:41`
- 규칙: R-04 (아이콘/이모지 장식), 우선순위 LOW (운영자 콘솔 출력 1건)
- 사유: `❌`는 정보를 더하지 않는다. 메시지 본문("둘 중 하나는 반드시 설정해야 해요")이 이미 실패 원인과 조건을 말한다.
- 근거:
  ```
  console.error('❌ NOTIFIER_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
  ```
- 제안: 이모지를 제거하고 메시지만 남긴다.

## 검사했지만 문제 없는 항목

- R-16 바즈워드: 원활/혁신/Seamless/차세대/혁신적/매끄럽 계열 문자열 0건 (grep 확인).
- R-15 범용 CTA: "자세히 보기/시작하기/Get Started/Try Now"류 0건. 오류 안내는 모두 원인과 다음 행동을 명시한다 (예: `social.ts:274` 치지직 검색 실패 안내).
- R-17/R-36/R-38 근거 없는 숫자·통계·보장: 유저 대상 문자열 0건. 코드에 등장하는 숫자는 근거가 있는 값이다. `dispatcher.ts:72`의 "과거 영상 15개"는 YouTube Atom 피드 항목 수 제한, `twitchScheduler.ts:19`의 "약 10일/8일"은 Twitch EventSub 구독 수명 규칙, `youtubeWebSub.ts:13`의 lease 5일은 hub 최대 lease를 가리킨다. 모두 프로토콜 사실이지 마케팅 숫자가 아니다.
- 챗봇 클로저: "도움이 되셨나요/궁금한 점은 문의하세요"류 0건. 유저 대상 임베드 문구는 `${SOCIAL_PLATFORM_LABELS[platform]} 알림` 뿌리와 `${author} 방송 시작!` 제목(`eventsub.ts:110`, `chzzkPoller.ts:127`)으로 구성된다.
- R-04 헤딩 장식 이모지: 코드 주석에서 이모지 0건. 문자열상 1건은 finding 9.
- antislop-code 그 외 패턴: 재서술, 빈 라벨("Main logic"), 모호 TODO(TODO/FIXME/XXX grep 0건), JSDoc 시그니처 반복, end marker, 줄 단위 내레이션, 딱딱/외침 문체 모두 0건. 문체는 전 모듈에서 일관된 "~해요" 구어체다.
- 보존 대상 주석 (제거 금지): 보안은 `social.ts:179`/`social.ts:221` IDOR 방지 where 스코프, `social.ts:17` webhookToken 비노출, `env.ts:39` fail-closed, `eventsub.ts:40` 리플레이 가드. 프로토콜은 `pubsub.ts:19`/`eventsub.ts:65` hub 재전송 타이밍, `youtubeWebSub.ts:12` lease 유실. 엣지케이스는 `redis.ts:57` isReady 가드(오프라인 큐 영구 대기 방지), `dispatcher.ts:106` migration 미적용 행, `chzzkPoller.ts:62` 빈 목록 위장 금지. 성능은 `chzzkPoller.ts:19` 구독 캐시. 각 주석은 코드가 보여주지 않는 이유/제약을 담고 있다.
- ai-slop-cleaner 중복: 웹훅 포맷터의 플랫폼별 복붙 없음. `dispatcher.ts`가 단일 `buildEmbed` + `PLATFORM_COLORS`(17~21)로 유튜브/트위치/치지직을 커버한다.
- 불필요 래퍼: `utils/logger.ts`(3줄)는 15개 모듈이 공용으로 쓰는 `getAppLogger` 팩토리로 정당하다.
- 잘못된 레이어 import: `routes/social.ts:10`가 `twitchScheduler.ts`에서 `twitchSubscriptionStateKey`를 임포트하는 것은 공유 Redis 키 계약이며 `twitchScheduler.ts:14`에 의도가 문서화돼 있다.
- 테스트复: 14개 테스트 파일이 핵심 계약을 잠가 둔다. IDOR 404(`social.test.ts:186`), dedup 삽입 경합(`dispatcher.test.ts:87`), 429 재시도·5회 연속 실패 표시(`dispatcher.test.ts:186`/`201`), 브레이커 half-open(`pollingLoop.test.ts:207`), 404 삭제 채널 비봉쇄(`chzzkPoller.test.ts:159`), EventSub 리플레이 거부(`eventsub.test.ts:65`), 부트스트랩 env 테스트만 finding 8로 남겼다.
- 접근성·레이아웃 규칙 (R-03, R-25, R-32, R-34, R-27 UI 상태 등): notifier는 UI가 없는 Fastify 백엔드 서비스라 해당 없음. R-27의 "데이터 표시 UI 3상태"는 HTTP 에러 코드 체계(401/403/404/409/502/503)로 대체되고 있고, 이는 `server.test.ts`에 잠겨 있다.


---

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


---

TOTAL: 7 (HIGH:0 MEDIUM:2 LOW:5)

# 16. packages/utils 오디오·명령어 계약 파일 감사

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 16 (소스 8, 테스트 8)
- 범위: `packages/utils/src/` 의 lavalinkHosts.ts, lavalinkTrack.ts, playerState.ts, playerWeb.ts, guildData.ts, jtcSetup.ts, customCommand.ts, youtube.ts 및 각 `*.test.ts`
- 방법: 스킬(antislop, antislop-code, antislop-copywriting, antislop-human, antislop-layoutmobile, antislop-ui) 로드 후 주석 슬롭, 코드 슬롭, 유저 대상 문자열 기준으로 전수 검사. export 사용처는 저장소 전체 grep으로 확인.

## Findings

### 1. [MEDIUM] customCommand.ts의 `// ---` 장식 구분선 주석 5곳
- 위치: packages/utils/src/customCommand.ts:53 (동일 패턴 58, 79, 114, 203)
- 규칙: antislop-code 체크리스트 Decorative Separators
- 사유: 라벨을 `---`로 감싼 장식이 정보를 대신해 AI 생성 주석의 전형적 형태이나, 라벨 텍스트 자체는 유효한 정보라 그대로 둘 수 있음.
- 근거 (5곳 중 em dash가 없는 대표 예시):
```ts
// --- 스펙 전체 검증 ---
```
- 제안: `// 실행 방식(method): DB 컬럼과 같은 값이라 생성 후 변경 불가` 식의 구분선 없는 한 줄로 교체. (53행도 `// ---` 래핑에 이어지는 대시 문자가 붙은 동일 패턴)

### 2. [MEDIUM] CHAPTER_FETCH_MIN_DURATION_MS 상수가 utils와 data-api에 중복 정의
- 위치: packages/utils/src/lavalinkTrack.ts:7 (중복: apps/data-api/src/providers/chapters.ts:13)
- 규칙: ai-slop-cleaner 파일 간 중복
- 사유: 같은 이름·값(15분)의 상수가 패키지 경계 양쪽에 각각 export되어, 한쪽만 수정되면 봇의 챕터 사전 게이트와 data-api의 챕터 조회 기준이 조용히 어긋남. data-api는 이미 다른 유틸을 `@sirubot/utils`에서 import하므로 단일 소스화가 가능함.
- 근거:
```ts
export const CHAPTER_FETCH_MIN_DURATION_MS = 15 * 60 * 1000;
// packages/utils/src/lavalinkTrack.ts:7 와 apps/data-api/src/providers/chapters.ts:13 에 동일 정의 (grep 확인)
```
- 제안: data-api 쪽 정의를 `@sirubot/utils` import로 교체해 기준을 한 곳으로 모음.

### 3. [LOW] youtube.ts의 metadata(sessionId/experimentId)가 생산만 하고 소비처 없음
- 위치: packages/utils/src/youtube.ts:63 (타입 정의 12~16, 추천어 type 필드 5·56도 동일)
- 규칙: ai-slop-cleaner 죽은 코드
- 사유: 패키지 바럴 export는 getSimpleYouTubeSuggestions뿐이라( index.ts:11 ) metadata는 함수 내부에서 바로 버려지고, 저장하거나 읽는 곳이 없음. Suggestion.type 필드도 필터·정렬 어디서도 읽히지 않음.
- 근거:
```ts
sessionId: metadata.j || '',
experimentId: metadata.k || 0,
```
- 제안: metadata 매핑과 필드를 제거하거나, 실제로 쓰이는 소비처를 연결.

### 4. [LOW] playerWeb 응답의 guildId가 요청 쪽 redisIdSchema 대신 느슨한 수동 스키마
- 위치: packages/utils/src/playerWeb.ts:93
- 규칙: ai-slop-cleaner 중복(공용 스키마 대신 손으로 다시 쓴 id 검증)
- 사유: 같은 파일 요청부(34행)는 redisIdSchema를 쓰지만 응답부는 `min(1).max(32)`만 적용해, 요청에서 거부되는 'guild:1' 같은 값이 응답 검증을 통과함. redisIdSchema의 키 주입 방지 규칙은 playerWeb.test.ts:47~52에 이미 테스트로 고정되어 있음.
- 근거:
```ts
guildId: z.string().min(1).max(32),
```
- 제안: 응답 guildId도 redisIdSchema로 통일.

### 5. [LOW] customCommand.ts 헤더의 스펙 버전 히스토리 주석
- 위치: packages/utils/src/customCommand.ts:10
- 규칙: antislop-code 체크리스트 Over-Explained(version history)
- 사유: v1/v2 변경 이력 나열은 스키마 선언부의 v1(196행)·v2(184행) 주석과 git 이력이 이미 담당하는 중복 기록이며, 위 8~9행의 스키마 동기화 지침과 성격이 다름.
- 근거:
```ts
 * - v1(2026-10): send_message(텍스트)·delay
 * - v2(2026-10): 실행 제한(access)·역할 부여/제거·리액트·고정·지연 삭제·if·인수 치환·CV2 디자인
```
- 제안: 이력 2줄만 삭제하고 동기화 지침은 유지.

### 6. [LOW] youtube.ts의 외부 요청·JSONP 파싱 경로에 테스트 없음
- 위치: packages/utils/src/youtube.ts:19
- 규칙: ai-slop-cleaner 테스트 누락(LOW)
- 사유: youtube.test.ts는 filterYouTubeSuggestions만 다루어, JSONP 응답 정규식 매칭 실패(46행)와 외부 JSON을 `any[]`로 캐스팅하는 매핑(54행)의 실패 경로가 검증되지 않음.
- 근거:
```ts
const jsonpMatch = text.match(/window\.google\.ac\.h\((\[.*\])\)/);
```
- 제안: fetch 모킹으로 파싱 성공·정규식 불일치 케이스 테스트 추가.

### 7. [LOW] playerWeb 계약 테스트가 이모지 장식 유저 에러를 정규 예시로 고정
- 위치: packages/utils/src/playerWeb.test.ts:106 (109행 단언 동일)
- 규칙: antislop-ui 체크리스트 Emoji as Decoration(R-04)
- 사유: playerWeb 계약의 error 문자열은 실패 사유를 사용자에게 그대로 보여주는 자리인데, 라운드트립 테스트 예시에 이모지가 붙은 형태가 고정되어 있어 무의식적으로 장식 패턴을 재생산. 실제 생산자는 감사 범위 밖의 봇이므로 utils 쪽은 예시 규범을 바꾸는 것으로 방향 유도.
- 근거:
```ts
error: '🎧 음성 채널에 먼저 접속해 주세요.'
```
- 제안: 픽스처를 이모지 없는 안내문으로 바꿔 유저 대상 문자열 규범을 제시.

## 검사했지만 문제 없는 항목

- lavalinkHosts.ts: 에러 메시지에 엔트리 원문·비밀번호를 넣지 않는 보안 규칙(29·39행)이 주석과 코드·테스트(lavalinkHosts.test.ts:26~38)로 일치. 포트 경계·폴백 병합 처리도 문서화된 그대로 동작.
- lavalinkTrack.ts: 헤더와 각 함수 주석이 소스 접미사 판별·videoId 대응·챕터 소유권(data-api) 같은 실제 계약을 담고 있어 보존 대상. JSDoc 시그니처 반복 없음.
- playerState.ts: ended 톰스톤 규칙(37~39행)과 queue 배열 상한(29행) 주석은 안전·호환 규칙 설명로 유효하며, 구버전 퍼블리셔 호환까지 테스트로 검증됨(playerState.test.ts:37~47).
- playerWeb.ts: SSRF 차단 이유(45~48행)와 계약 흐름 설명은 프로토콜 사실이며, zod 사용자 메시지(52~53, 68행)는 자연어로 근거 있는 숫자(0~150)만 사용.
- guildData.ts·jtcSetup.ts: 401 우회 이유, 봇 토큰 전용 규격, 채널명 상수 위치 등 헤더 정보는 각각 다른 사실이라 문서 중복이 아님. 빈 라벨·단계 내레이션 없음.
- customCommand.ts: 역할 탈취 방지를 위한 walkSteps 재귀 검사(241~242행), discriminatedUnion 순수 object 제약(118행), zod 4 .partial 제약(300행) 주석은 각각 엣지케이스·워크어라운드 설명로 보존 대상. 유저 메시지 전체가 자연어이며 이모지·em dash·버즈워드·범용 CTA 없음.
- 유저 대상 문자열 전체(zod 메시지·스펙 문서 문자열): R-02 em dash 없음, R-16 버즈워드 없음, R-15 범용 CTA 없음, R-17/R-36 근거 없는 숫자 없음(모든 숫자는 같은 파일의 상수와 일치).
- 테스트 점검: 8개 소스 파일 모두 대응 테스트 존재. Redis 키 주입 방지, SSRF 스킴 제한, v1 스펙 호환, 예약어, 중첩 if 가드 우회까지 계약·보안 엣지케이스를 테스트로 고정하고 있음.
- 다른 주석 슬롭 패턴: 범위 내 8개 파일에 모호 TODO/FIXME, end marker, 장식 이모지,ALL CAPS 라벨, 라인별 내레이션 없음(범위 내 `// ---` 구분선은 customCommand.ts 5곳이 전부, finding 1로 처리).
- playerState의 queuedTrackSummarySchema와 playerWeb의 playerWebTrackSchema는 title/author/durationMs/artworkUrl/isStream이 겹치지만, 필드 집합(요청자명 vs uri/sourceName)과 목적(큐 스냅샷 vs 검색 결과)이 달라 의도적 분리로 판단. 스키마 합치기보다 통신 계약 유지가 적절.


---

TOTAL: 14 (HIGH:1 MEDIUM:4 LOW:9)

# 17. packages/utils/src 도메인 파일군 (chatTools · delivery · weather · social · greetingCardDesign · memberGreeting · storage)

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 감사 파일 수: 22개 (소스 13 + 테스트 9)
- 범위: `chatTools.ts`, `chatTools/{emoji,messageLink,embedFix,chatToolMode,og,counting}.ts`, `delivery.ts`, `weather.ts`, `social.ts`, `greetingCardDesign.ts`, `memberGreeting.ts`, `storage.ts` 및 각 `*.test.ts`
- 방법: 읽기 전용 검토. 빌드·테스트·git은 실행하지 않았고, 범위 밖 파일은 읽지 않았다. 심볼 사용처 확인만 전체 저장소 경로 검색(내용 미열람)으로 했다.

### 1. [HIGH] 인사 카드 변수 설명 문자열에 em dash (U+2014)
- 위치: `packages/utils/src/memberGreeting.ts:342`
- 규칙: R-02
- 사유: 대시보드 에디터의 변수 삽입 칩에 표시되는 유저 대상 문자열인데 구분자로 em dash를 쓴다(사용처는 같은 파일 338라인 주석에 명시).
- 근거:
```ts
{ token: '{유저}', description: '멘션(@유저)으로 표시 [원문에는 여기에 U+2014 문자 1개] 봇 메시지 전용, 이미지 카드에는 못 써요', usableInImage: false },
```
- 제안: 구분자를 쉼표 또는 괄호로 바꿔 문자열에서 em dash를 제거한다.

### 2. [MEDIUM] memberGreeting의 섹션 구분선 주석 5개
- 위치: `packages/utils/src/memberGreeting.ts:14` (동일 패턴 124, 207, 259, 337)
- 규칙: antislop-code 체크리스트 (장식 구분선·박스 헤더 금지)
- 사유: `// --- 라벨 ---` 형태는 장식이 정보를 대신하는 대표 패턴이라 정보를 더하지 않는다.
- 근거:
```ts
// --- 공용 상수 ---
// --- zod 스키마 ---
// --- 기본값 (v2) ---
```
- 제안: 구분선 기호를 빼고 필요한 경우 일반 한 줄 주석으로 남기거나 삭제한다.

### 3. [MEDIUM] chatTools 모듈의 섹션 구분선 주석 2개
- 위치: `packages/utils/src/chatTools/embedFix.ts:202`, `packages/utils/src/chatTools/og.ts:94`
- 규칙: antislop-code 체크리스트 (장식 구분선·박스 헤더 금지)
- 사유: 2번과 같은 대시 형태이고, embedFix 건은 라벨 안에 화살표까지 섞은 장식성 라인이다.
- 근거:
```ts
// --- 임베드 복구 메타데이터 게이트웨이 계약: 봇 → data-api 요청/응답 스키마 ---
// --- X(Twitter) 메타데이터: FxEmbed API 페이징을 봇이 쓰기 좋은 형태로 정리해요 ---
```
- 제안: 계약 설명은 아래 JSDoc으로 옮기고 구분선 자체는 제거한다.

### 4. [MEDIUM] 재수출 셸 문서가 하위 모듈 문서를 그대로 복사
- 위치: `packages/utils/src/chatTools.ts:4` (`chatTools/emoji.ts:4`, `chatTools/messageLink.ts:4`와 동일 문구), `chatTools.ts:6` (`chatTools/embedFix.ts:5`와 동일 문구)
- 규칙: antislop-code 재서술 + ai-slop-cleaner 파일 간 중복
- 사유: 같은 설명이 파일마다 그대로 붙어 있어, 한쪽을 고치면 다른 쪽이 조용히 어긋난다. chatTools.ts:6와 embedFix.ts:5는 문장 전체가 문자 단위로 같다.
- 근거:
```ts
// chatTools.ts:4 / emoji.ts:4 / messageLink.ts:4
 * 봇의 general/message 리스너들은 이 모듈의 순수 함수로만 메시지를 판정해요 (DB·Discord API 접근 없음).
 * 봇의 general/message 리스너가 이 모듈의 순수 함수로만 메시지를 판정해요 (DB·Discord API 접근 없음).
```
- 제안: 셸 문서는 모듈 목록과 배럴 경로만 남기고, 리스너·프로바이더 계약 설명은 각 모듈 문서 한 곳에만 둔다.

### 5. [MEDIUM] 기본 환영 카드 레이어 데이터가 템플릿과 완전 동일 복사
- 위치: `packages/utils/src/memberGreeting.ts:218` (DEFAULT_WELCOME_GREETING), `packages/utils/src/memberGreeting.ts:273` (GREETING_TEMPLATES classic-center)
- 규칙: ai-slop-cleaner 파일 간(데이터) 중복
- 사유: avatar/title/subtitle 3개 레이어 값이 문자열까지 동일해서, 기본값만 손보면 템플릿이 조용히 어긋난다.
- 근거:
```ts
{ id: 'avatar', type: 'avatar', x: 50, y: 20, size: 180, ringColor: '#ffffff' },
{ id: 'title', type: 'text', x: 50, y: 44, size: 44, color: '#ffffff', bold: true, align: 'center', text: '{유저이름} 님 반가워요!' },
// 273~287행 classic-center도 위 3개 레이어가 동일
```
- 제안: 한쪽을 기준 데이터로 두고 다른 쪽이 참조하게 해 복제 지점을 없앤다.

### 6. [LOW] 같은 파일 안에서 같은 문장이 두 번 등장
- 위치: `packages/utils/src/chatTools/counting.ts:5` (`counting.ts:37`과 동일), `packages/utils/src/chatTools/emoji.ts:5` (`emoji.ts:11`과 같은 문구)
- 규칙: antislop-code 재서술
- 사유: 모듈 헤더의 한 줄이 함수 주석에서 그대로 반복된다.
- 근거:
```ts
 * 판정은 순수하게 유지하고 저장은 봇 서비스가 해요.      // counting.ts:5
 * 틀리면 0으로 초기화돼요 (reset: true). 판정은 순수하게 유지하고 저장은 봇 서비스가 해요.  // counting.ts:37
```
- 제안: 모듈 헤더와 함수 주석 중 한 곳만 남긴다.

### 7. [LOW] DeliveryError와 WeatherError가 구조가 같은 에러 클래스 복붙
- 위치: `packages/utils/src/delivery.ts:9`, `packages/utils/src/weather.ts:11`
- 규칙: ai-slop-cleaner 파일 간 중복 (에러 클래스)
- 사유: identifier 할당부터 `name` 지정까지 9줄 구조가 동일하다. 도메인별 서브패스 단일 홈 정책상 의도적 복제일 수 있으나, 근거가 주석으로 남아 있지 않다.
- 근거:
```ts
export class DeliveryError extends Error {
	public constructor(public readonly identifier: string, message: string) {
```
```ts
export class WeatherError extends Error {
	public constructor(public readonly identifier: string, message: string) {
```
- 제안: 공용 Error base를 둘지 결정하고, 그대로 두기로 하면 복제를 택한 이유를 한 줄 주석으로 남긴다.

### 8. [LOW] 외부 소비자가 없는 함수 export 2개
- 위치: `packages/utils/src/storage.ts:55` (parseAssetKey), `packages/utils/src/chatTools/og.ts:44` (absolutizeUrl)
- 규칙: ai-slop-cleaner 죽은 코드/미사용 export (LOW)
- 사유: parseAssetKey는 저장소 `.ts/.tsx` 검색 기준 테스트 파일에서만 쓰이고, absolutizeUrl은 og.ts 내부 호출(parseOgMeta) 전용이다.
- 근거:
```ts
export function parseAssetKey(key: string): { guildId: string; assetId: string; ext: string } | null {
export function absolutizeUrl(value: string, pageUrl: string): string {
```
- 제안: 실제 호출처를 확인해 export를 제거하거나, 공개 계약으로 남길 근거를 주석으로 남긴다.

### 9. [LOW] 파일 내부에서만 쓰이는 상수 export 4개
- 위치: `packages/utils/src/chatTools/messageLink.ts:8` (MESSAGE_LINK_MAX), `chatTools/embedFix.ts:45` (EMBED_FIX_LINK_MAX), `chatTools/embedFix.ts:205` (EMBED_FIX_METADATA_LINK_MAX), `packages/utils/src/memberGreeting.ts:357` (PRESET_BACKGROUND_IDS)
- 규칙: ai-slop-cleaner 미사용 export (LOW)
- 사유: 4개 모두 정의 파일 밖 사용처와 테스트 사용처가 없다(전체 저장소 검색 기준). 같은 파일의 상수 기본값/스키마에만 쓰인다.
- 근거:
```ts
export const MESSAGE_LINK_MAX = 3;
export const EMBED_FIX_LINK_MAX = 2;
export const PRESET_BACKGROUND_IDS: readonly string[] = PRESET_BACKGROUNDS.map((preset) => preset.id);
```
- 제안: export 노출 범위를 줄이거나, 계약 상수로 남길 이유를 한 줄로 남긴다.

### 10. [LOW] renderGreetingTemplate 치환 함수에 직접 테스트가 없음
- 위치: `packages/utils/src/memberGreeting.test.ts:15`
- 규칙: ai-slop-cleaner 테스트 누락 (LOW)
- 사유: 해당 파일 테스트는 layout/accentColor 검증만 담고 있고, `{유저} {유저이름} {서버} {멤버수}` 치환과 mention 부재 시 표시 이름 폴백을 직접 검사하는 테스트는 저장소 전체에 없다.
- 근거:
```ts
describe('greetingConfigSchema [원문에는 여기에 U+2014] layout / accentColor', () => {
	it('기본 설정에는 컨테이너 레이아웃과 기본 강조색(null)이 들어 있다', () => {
```
- 제안: mention(null) 폴백과 4개 변수 치환을 최소 2케이스로 추가한다.

### 11. [LOW] 인사 카드 레이어 스키마 경계값 테스트가 없음
- 위치: `packages/utils/src/memberGreeting.test.ts:1`, 근거 스키마 `packages/utils/src/memberGreeting.ts:131`
- 규칙: ai-slop-cleaner 테스트 누락 (LOW)
- 사유: DATA_URI 허용 형식과 1.5MB 상한, 텍스트 size 12~160 한도, 모르는 프리셋 거부(`알 수 없는 배경 프리셋`)를 검사하는 테스트가 테스트 파일 검색 기준 0건이다.
- 근거:
```ts
	size: z.number().min(12).max(160),
	layers: z.array(greetingLayerSchema).max(50)
```
- 제안: DATA_URI/크기 한도/모르는 프리셋 거부 3개 경계 케이스를 추가한다.

### 12. [LOW] storage의 assetNameSchema 테스트가 없음
- 위치: `packages/utils/src/storage.test.ts:23`, 근거 스키마 `packages/utils/src/storage.ts:63`
- 규칙: ai-slop-cleaner 테스트 누락 (LOW)
- 사유: 대시보드 API(`apps/dashboard/src/app/api/servers/[id]/assets/route.ts`)가 쓰는 이름 검증 스키마인데, 저장소 테스트는 키·매직 바이트만 다룬다.
- 근거:
```ts
export const assetNameSchema = z
	.string()
	.trim()
```
- 제안: 빈 이름 거부와 60자 초과 거부 2케이스를 추가한다.

### 13. [LOW] 스키마 size 하단이 출력 한글 본문 14px 미만을 허용
- 위치: `packages/utils/src/memberGreeting.ts:131`, 축소 배율 `packages/utils/src/memberGreeting.ts:22`
- 규칙: 감사 기준 4 (화면 이미지 디자인 값: 한글 본문 14px 미만)
- 사유: size 최소 12(논리 px)에 GREETING_RENDER_SCALE 2/3를 곱하면 출력 PNG 기준 8px라서, 프리셋 기본값(22~26 → 14.7~17.3px)과 달리 읽기 어려운 본문이 저장 가능하다.
- 근거:
```ts
export const GREETING_RENDER_SCALE = 2 / 3;
	size: z.number().min(12).max(160),
```
- 제안: 하단을 출력 14px 이상이 되도록(논리 21px) 올리거나 에디터에서 최소 크기를 막아 알린다.

### 14. [LOW] 카드 좌표계 설명이 한 파일 안에서 겹치고, 한 블록은 선언에 붙지 않음
- 위치: `packages/utils/src/memberGreeting.ts:30` (블록 30~34행), 중복 상대 `memberGreeting.ts:15`
- 규칙: antislop-code 재서술 (코드가 이미 보여주지 않는 정보만 남기기)
- 사유: 30~34행 JSDoc은 바로 아래가 빈 줄이고 이어 다른 JSDoc(36행)이 나와 선언에 붙어 있지 않으며, "카드 좌표계 + 렌더러/에디터 미러 + 1200×675"는 15행 상수 주석과 겹친다.
- 근거:
```ts
/** 카드 기준 좌표계 [원문에는 여기에 U+2014] 렌더러/에디터 미러 공용 계약.
 * x/y는 카드 너비·높이 대비 %(0~100), **중앙 앵커**(요소 중심이 그 점에 놓인다).
```
- 제안: 좌표계 계약(앵커·단위 포함)을 한 곳에만 두고, 남기는 쪽은 선언 바로 위에 붙인다.

## 검사했지만 문제 없는 항목

- **R-02 (유저 대상 문자열 em dash)**: 범위 내 문자열 리터럴 전수 확인 결과 1번 1건뿐이다. `social.ts` 안내문(70, 74, 77, 78, 82, 84, 86, 88, 118, 136, 137, 138, 144, 145, 146, 189, 222), `storage.ts`(46, 48, 50, 66, 67), `chatTools/embedFix.ts:13`, `memberGreeting.ts` 인사 카드 문구(212, 220, 230, 240, 248, 249, 275, 285, 297, 307, 320, 330)에는 em dash가 없다. 나머지 em dash는 주석·문서에만 존재한다.
- **R-16 (버즈워드)**: 검색어(원활, 혁신, Seamless, 완벽, 최적의, 강력한, 편리한 등) 기준 0건.
- **R-15 (범용 CTA)**: 자세히 보기/지금 시작/더 알아보기/클릭해 주세요류 문구 0건.
- **R-17/R-36/R-38 (근거 없는 숫자·보장)**: 문자열의 수치(1000자, 80자, 2048자, 60자, 8MB, 1200x675, 800x450)는 모두 같은 파일의 상수·Discord 한도와 일치한다. `{멤버수}번째 멤버`는 Discord 실측값을 끼워 넣는 변수라 조작된 통계가 아니다. 확률·보장 표현 0건.
- **R-04 (이모지 장식)**: 소스 문자열에 이모지 0건. `chatTools.test.ts:43`(유니코드 이모지 입력값), `social.test.ts:79`(이모지가 든 템플릿 예시)는 테스트 입력 데이터다.
- **챗봇 클로저·과장 마무리**: 질문형으로 묻는 마무리 문구 0건.
- **R-25 (대비)**: 스킬 contrast-check 스크립트와 같은 WCAG 공식을 인라인 계산으로 적용해 배경(그라데이션 + 코너 글로우 + 스크림 rgba(26,14,18,0.32))을 합성했다. rose 프리셋 위 흰색 제목(44) 4.46~4.78(큰 글씨 3:1 기준 통과), 흰색 부제(24) 4.63~4.90(본문 4.5 기준 통과), plum 위 #f0e2cf 부제 10.90, gold 밴드(#231a10 0.55) 위 #f0e2cf 부제 8.36. 명백한 저대비가 없어 FAIL로 단정하지 않았다. 단 gold 밴드 하단 경계 바로 아래로 텍스트가 빠질 경우 추정값이 4.02~4.35로 4.5에 근사해서, 렌더러의 텍스트 상자 계산(중앙 앵커 기준 상자는 밴드 안에 들어옴)을 확인한 뒤 재검이 필요하다.
- **글자 크기**: 프리셋 기본값은 GREETING_RENDER_SCALE 2/3 기준 제목 44 → 29.3px, 부제 26/24/22 → 17.3/16/14.7px라 14px 이상이다. 13번은 기본값이 아니라 허용 하단을 문제 삼은 것이다. 이 계산은 출력 PNG 크기 기준이며, Discord 임베드에서 실제 표시되는 축소율은 범위 밖이라 확인하지 않았다.
- **주석 슬롭 기타 유형**: 모호 TODO/FIXME 0건, 장식 이모지 주석 0건, end marker 0건, ALL CAPS 라벨 0건, 단계 내레이션(Step 1/Next/Finally) 0건, 라인별 내레이션 0건, 빈 라벨(주요 로직/에러 처리류) 0건. `social.ts`의 4~6줄 JSDoc(20~24, 40~45, 63~68, 192~196, 207~210행)은 Discord 멘션 스펙·보안 정책·요청/응답 호환 규칙 설명이라 보존 대상으로 판단했다.
- **테스트 커버리지**: `chatTools.test.ts`(536행)는 오탐 방지·한도·잘림·게이트웨이 스키마까지, `social.test.ts`(422행)는 스키마 전부, `greetingCardDesign.test.ts`는 시각 계약과 프리셋 키 일치, `delivery/weather/chatToolMode/barrel` 테스트까지 있다. 누락은 10~12번에만 적었다.
- **미검증 항목**: 빌드·테스트·타입체크는 금지되어 실행하지 않았다(실패한 테스트 여부는 확인하지 않음). 기본 웹훅 이름의 조합 문자열은 범위 밖 파일에 있어, `social.ts:162` 주석의 기본 이름 형식에 em dash가 실제로 들어가는지는 확인하지 못했다(범위 밖이라 finding으로 올리지 않음).


---

TOTAL: 7 (HIGH:0 MEDIUM:2 LOW:5)

# 18. packages/prisma (스키마·마이그레이션)

- 날짜: 2026-10-23
- 브랜치: chore/antislop-audit
- 범위: `packages/prisma/src/schema.prisma`, `packages/prisma/src/migrations/**`, `packages/prisma/prisma.config.ts`, `packages/prisma/package.json`, `packages/prisma/tsconfig.json`
- 감사 파일 수: 32개 (스키마 1, 마이그레이션 SQL 27, migration_lock.toml 1, 설정 파일 3)
- 판정 기준 메모: copy 규칙(R-02, R-16, R-36, R-38)은 감사 기준 3에 따라 스키마의 유저 대상 문자열에만 적용했다. 개발자용 주석에 쓰인 연결용 em dash(U+2014)는 유저 대상 텍스트가 아니라 범위 밖으로 보고 finding으로 잡지 않았다. UI 계열 Purpose-Gate 규칙(R-01, R-04, R-10 등)은 이 범위에 해당 표현이 없다.

## Findings

### 1. [MEDIUM] CustomCommand의 guildId 단일 인덱스가 복합 유니크와 중복
- 위치: `packages/prisma/src/schema.prisma:92` (91행 유니크와 짝)
- 규칙: 감사 기준 2 (중복 인덱스)
- 사유: `@@unique([guildId, name])`의 선두 컬럼이 guildId라 같은 쿼리를 커버하므로 단일 인덱스는 쓰기 비용과 저장량만 추가한다.
- 근거:

```prisma
  @@unique([guildId, name])
  @@index([guildId])
```

- 제안: 스키마에서 `@@index([guildId])`를 빼고 새 마이그레이션으로 같은 이름 인덱스를 DROP한다 (20261015100000/migration.sql:24 생성분 포함).

### 2. [MEDIUM] PlaylistTrack의 playlistId 단일 인덱스가 복합 유니크와 중복
- 위치: `packages/prisma/src/schema.prisma:222` (221행 유니크와 짝)
- 규칙: 감사 기준 2 (중복 인덱스)
- 사유: `@@unique([playlistId, position])` 선두 컬럼이 playlistId라 단일 인덱스가 같은 범위를 이미 커버한다.
- 근거:

```prisma
  @@unique([playlistId, position])
  @@index([playlistId])
```

- 제안: 스키마에서 `@@index([playlistId])`를 빼고 새 마이그레이션으로 DROP한다 (20261002000000/migration.sql:51 생성분 포함).

### 3. [LOW] 스키마 상단의 prisma init 템플릿 주석이 정보를 주지 않는다
- 위치: `packages/prisma/src/schema.prisma:1` (1~5행)
- 규칙: antislop-code 체크리스트 (코드에 없는 정보를 주지 않는 주석, R-31)
- 사유: 이 스키마에 대한 정보가 없는 서식 문구와 Prisma Accelerate 홍보 링크 5줄이 파일을 연다.
- 근거:

```prisma
// Looking for ways to speed up your queries, or scale easily with your serverless or edge functions?
// Try Prisma Accelerate: https://pris.ly/cli/accelerate-init
```

- 제안: 1~5행을 삭제한다.

### 4. [LOW] 카테고리명만 적은 빈 라벨 주석
- 위치: `packages/prisma/src/schema.prisma:126` (동일 라벨 131행, 146행)
- 규칙: antislop-code (빈 라벨)
- 사유: `// Relations`는 아래 필드가 관계라는 사실을 반복만 하고, `// Statistics`는 createdAt/updatedAt까지 통계로 묶는다.
- 근거:

```prisma
  // Statistics
  totalPlays  Int      @default(0)
  createdAt   DateTime @default(now())
```

- 제안: 라벨을 지우거나, 라벨 대신 각 필드에 사실 정보를 남긴다.

### 5. [LOW] UserToken 필드 주석이 모델 주석과 식별자를 재서술
- 위치: `packages/prisma/src/schema.prisma:158` (같은 블록 156~157행)
- 규칙: antislop-code (재서술, Signature Echo)
- 사유: `accessTokenExpiresAt`이 이미 "access token 만료 시각"이고, 암호화 사실은 153행 모델 주석(AES-256-GCM)에 이미 있다.
- 근거:

```prisma
  refreshToken         String   // 암호화된 refresh token
  accessToken          String   // 암호화된 access token
  accessTokenExpiresAt DateTime // access token 만료 시각
```

- 제안: 158행 주석은 삭제하고, 156~157행은 모델 주석에 이미 있는 암호화 방식을 적거나 주석을 없앤다.

### 6. [LOW] 존재하지 않는 단계를 알리는 마이그레이션 주석
- 위치: `packages/prisma/src/migrations/20261001000000_add_chat_history/migration.sql:1`
- 규칙: antislop-code (단계 내레이션 + 빈 라벨)
- 사유: 이 마이그레이션에는 enum 생성이 없는데 `-- CreateEnum (none)`이라는 단계 표시만 남아 있다.
- 근거:

```sql
-- CreateEnum (none)

-- CreateTable
```

- 제안: 해당 행을 삭제한다.

### 7. [LOW] 스키마 주석이 마이그레이션에 그대로 복붙됐다 (주석 이중 정의)
- 위치: `packages/prisma/src/schema.prisma:62` / `packages/prisma/src/migrations/20261010000000/migration.sql:1`
- 규칙: 감사 기준 2 (주석 이중 정의)
- 사유: 같은 문장이 두 파일에 동일하게 있고, "타입과 동기화" 계약은 스키마가 단일 원본이다. 커스텀 명령어도 schema.prisma:73과 20261015100000/migration.sql:1이 같은 두 사실을 재구성해 적었다.
- 근거:

```prisma
// 멤버 인사: 입장/퇴장 메시지 + 커스텀 카드 이미지 설정. 구조는 packages/utils/src/memberGreeting.ts 타입과 동기화.
```

- 제안: 마이그레이션 쪽에는 새 컬럼의 용도 한 줄만 남기고, 타입 동기화 계약 문장은 스키마에만 둔다.

## 검사했지만 문제 없는 항목

- 마이그레이션 위험성·데이터 보존 주석: `20261004105034/migration.sql:1-6`, `20261005034316/migration.sql:1-6`의 drop column 경고, `20261004104751/migration.sql:1-6`의 UserFavorite 정리와 drift 방지 근거, `20261021120000/migration.sql:1-3`의 인덱스 제거 근거와 컬럼 보유 이유는 모두 보존 대상이라 finding으로 잡지 않았다.
- 3줄 초과 과설명: `schema.prisma:165-168`(GameRecord 4줄)은 각 줄이 목적, game 값, result 값, meta 형태라는 별개 계약이라 보존; `schema.prisma:264-266`(SocialSubscription 3줄)은 한도 이내이며 도메인 소유권과 전송 경로 설명이라 보존.
- 구분선, 장식 이모지, end marker, 모호 TODO: `packages/prisma/src` 전체를 `TODO|FIXME|====|✅|🚀|end of`로 검색해 0건. `20261004104751/migration.sql:2`의 `Note:`는 데이터 보존 설명 블록이라 제외.
- 딱딱/외침 문체: 한국어 주석이 전부 "~해요" 평서체이고 ALL CAPS 배너가 없다. `-- CreateTable`, `-- CreateIndex`, `-- AlterTable` 등은 Prisma가 생성하는 구조 마커라 대상이 아니다.
- 죽은 모델/미사용 필드: 스키마상 명백한 근거를 찾지 못했다. `SocialEventLog.deliveredAt`은 `20261021120000/migration.sql:3`이 "컬럼 자체는 운영 조회용으로 유지"라는 보존 근거를 명시해 제외했다.
- 같은 필드 그룹과 주석의 모델 간 복붙: mode 계약 주석(`schema.prisma:40,43,48,51,54`)은 서로 다른 필드의 허용값을 각각 문서화한 것이라 이중 정의가 아니고, `schema.prisma:270,272`(SocialSubscription)와 `303,305`(SocialEventLog)는 채널 ID와 콘텐츠 ID로 값이 달라 각자 계약을 적은 것이다.
- 유저 대상 문자열의 copy 규칙: `@default("{user}의 방")`(`schema.prisma:35`), `@default("!")`, `@default("off"/"play"/"prefix")`, 마이그레이션 기본값 `'{user}의 방'`, `ARRAY['x','instagram','booth']`에 em dash(U+2014), 바즈워드, 무근거 수치가 없어 R-02/R-16/R-36/R-38에 해당하지 않는다. (주석의 연결용 em dash는 기준 3의 적용 범위 밖이라 여기서 제외, 상단 판정 기준 메모 참조)
- 설정 파일: `prisma.config.ts`(12행), `package.json`, `tsconfig.json`에는 주석이 없고 감사 기준에 해당할 표현이 없다.
- UI Purpose-Gate 규칙(R-01, R-04, R-07, R-09 등): 스키마와 SQL에 해당 표현이 없어 비대상.


---

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


---

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

