# FIX 리포트: 01 bot 오디오 + 03 bot voice/games

FIXED: 12 / DEFERRED: 4 / N/A: 0

- 수정 브랜치: `fix/bot-audio-games` (워크트리 `/home/seonu/.local/share/opencode/worktree/e08104/fix-bot-audio-games`)
- 커밋: `a592953d` chore(bot): antislop 감사 01/03 세그먼트 수정 (audio·games)
- 수정 범위: `apps/bot/src/modules/{audio,games}` (voice는 감사 결과 문제 없음, 수정 0건)

## finding별 처리

| 세그먼트#번호 | 우선순위 | 상태 | 변경 요약 | 파일:라인 (수정 후 기준) |
| --- | --- | --- | --- | --- |
| 01#1 | MEDIUM | deferred | 볼륨 버튼은 주석 처리돼 있지만 `handleVolume`은 `controllerButton.test.ts`의 테스트 4건이 잠금. 삭제하면 게이트가 깨지고, 버튼 재노출은 유저 화면 변경이라 두 방향 모두 행동 보존 원칙과 충돌. 되돌리고 제품 결정으로 이관 | apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts:98,220 (원상 복구), apps/bot/src/modules/audio/view/controller.ts:117 (원상 복구) |
| 01#2 | MEDIUM | fixed | 메서드 이름을 반복하는 빈 라벨 주석 9곳 제거. 88행 주석만 삭제 시 순서 제약(새 컨트롤러를 보내기 직전에만 삭제)이 사라져 한국어 한 줄로 유지 | apps/bot/src/modules/audio/lavalink/player/playerNotifier.ts:44,75,85,153,260,295,338,360 (제거), :84 (한국어 한 줄로 교체) |
| 01#3 | MEDIUM | fixed | `errorView` 헬퍼를 무시한 인라인 에러 컨테이너 10곳을 `errorView(...)` 호출로 치환 | apps/bot/src/modules/audio/commands/favorites.ts:151,214,297 / apps/bot/src/modules/audio/commands/playlist.ts:155,174,232,286,317,344,424 |
| 01#4 | LOW | fixed | FILTER_PRESETS 이름→라벨 매핑 5줄 로직의 파일 내 2중복을 `presetLabel` 헬퍼 하나로 통합 | apps/bot/src/modules/audio/view/filter.ts:31,51,99 |
| 01#5 | LOW | fixed | 디스코드 옵션 제약으로 사실상 도달 불가인 검증 3곳. 분기 제거 대신 방어 목적을 알리는 한 줄 주석을 추가하는 더 안전한 방법을 선택 (분기 제거는 UserError 식별자 경로를 없애는 동작면 changes risk가 있어 주석 채택) | apps/bot/src/modules/audio/subcommands/volume.ts:43 / apps/bot/src/modules/audio/subcommands/repeat.ts:47 / apps/bot/src/modules/audio/subcommands/tts.ts:43 |
| 01#6 | LOW | deferred | 유저 노출 문자열 이모지 표기 3종(앱 이모지·유니코드·없음) 통일은 (1) 유저에게 보이는 문자열이 바뀌는 동작 변경이고 (2) `emoji()` 통일에 필요한 앱 이모지 자산(emoji-ids.json)이 감사 범위 밖이라 미수정. `games.ts:35`의 사유(패배 계열 이모지 없음)처럼 자산 추가 여부가 먼저 필요한 작업 | 미변경 |
| 01#7 | LOW | fixed | 영문 재서술 주석 5곳 정리: 4곳 삭제, `lyrics.ts:63` 1곳은 타임스탬프 제거라는 실제 동작을 알리는 한국어 한 줄로 교체. `lyrics.ts:69`(Discord 4000자 제약)은 보존 | apps/bot/src/modules/audio/interaction-handlers/controllerButton.ts:383,417 → :383,415 인접 (제거) / apps/bot/src/modules/audio/subcommands/lyrics.ts:33(제거),63(교체) / apps/bot/src/modules/audio/interaction-handlers/settings.ts:125(제거) |
| 01#8 | LOW | deferred | queueAdvancer·playbackWatchdog 회귀 테스트는 α/β 이벤트 순서·watchdog 복구 재현을 위한 플레이어 목(mock)과 이벤트 스크립트 작성 비용이 커 별도 과제로 이관. 지명된 함수가 없어 단위 테스트 추가의 회귀 방지 효과가 작다고 판단 | 미변경 |
| 01#9 | LOW | fixed | 주석 오타 "스킵 표표 수"를 "스킵 표 수"로 교정 (제안의 "필요 표 수"안은 문장 흐름상 한 글자만 제거하는 수정으로 대체) | apps/bot/src/modules/audio/managers/voteSkip.ts:30 |
| 03#1 | HIGH | fixed | games 모듈 주석 em dash 6곳 치환. 5곳은 구두점(마침표·쉼표·콜론) 치환으로 내용 보존, 1곳(ohaasa.ts:127)은 finding 03#2와 동일 주석이라 제거로 처리 | apps/bot/src/modules/games/interaction-handlers/games.ts:9 / apps/bot/src/modules/games/utils/gameRecords.ts:138,150 / apps/bot/src/modules/games/utils/gameRecords.test.ts:12,32 / apps/bot/src/modules/games/commands/ohaasa.ts (제거) |
| 03#2 | MEDIUM | fixed | 출력 구조를 열거하되 "번역 안내" 등 렌더에 없는 항목까지 잘못 기술한 주석 제거 | apps/bot/src/modules/games/commands/ohaasa.ts:128 인접 (제거) |
| 03#3 | MEDIUM | fixed | games 공용 `textContainer(lines)` 헬퍼를 신설해 `noticeContainer`(games.ts), `resultContainer`(guess.ts), dice의 IIFE, checkin·fortune·ohaasa의 인라인 컨테이너 생성 총 6파일을 통합. 렌더 결과는 라인 `join('\n')` 동일 | apps/bot/src/modules/games/utils/textContainer.ts:4 / games.ts:43,85 / guess.ts:59,105,126,139 / dice.ts:70 / checkin.ts:50,63 / fortune.ts:67 / ohaasa.ts:137 |
| 03#4 | LOW | fixed | 바로 아래 삼항 연산자를 그대로 재서술한 주석 제거 | apps/bot/src/modules/games/commands/ohaasa.ts:133 인접 (제거) |
| 03#5 | LOW | fixed | fortune의 마법 상수 `% 5` 2곳을 `% getGrades().length`·`% getLuckyEmojis().length`로 통일 (현재 길이가 모두 5라 결과 동일) | apps/bot/src/modules/games/commands/fortune.ts:57,61 |
| 03#6 | LOW | fixed | repo 전체 grep으로 `recordGameResult` 호출부가 'rps'·'guess'·'attendance'뿐임을 확인 후 GAME_IDS의 미사용 'dice'·'quiz' 제거. DB `game` 컬럼은 문자열이라 레거시 행에는 영향 없음 | apps/bot/src/modules/games/utils/gameRecords.ts:6 |
| 03#7 | LOW | fixed | `getZodiacFromDate` 경계일 테스트 3개(12개 시작 경계·12개 끝 경계·연도 경계), `getGuessBest` 테스트 3개(최솟값 갱신·깨진 meta 필터링·빈 목록) 추가 | apps/bot/src/modules/games/utils/ohaasaService.test.ts:4 / apps/bot/src/modules/games/utils/gameRecords.test.ts:121 |

## 검증

워크트리에서 실제로 실행한 명령과 결과입니다.

- `yarn install` (worktree 루트): 성공. peer dependency 경고만 출력.
- `yarn generate`: 성공. 미생성 상태로는 `botApplication.test.ts`·`gameRecords.test.ts`가 `Failed to resolve entry for package "@sirubot/prisma"`로 수집 단계에서 실패함을 확인 후 생성.
- `yarn workspace @sirubot/bot lint`: 이 환경에서 exit 127 `command not found: prettier` 실패 (샌드박스의 yarn 스크립트 PATH 문제). 동일한 underlying 명령을 직접 실행: `../../node_modules/.bin/prettier --check "src/**/*.ts"` (cwd `apps/bot`) 결과 `All matched files use Prettier code style!`.
- `yarn workspace @sirubot/bot test`: 같은 환경 문제로 exit 127 `command not found: vitest`. 직접 실행: `./node_modules/.bin/vitest run --config vitest.config.ts apps/bot` 결과 `Test Files 49 passed (49) / Tests 527 passed (527)`.
- `yarn typecheck` (turbo): `Tasks: 14 successful, 14 total`.
- 중간 게이트 확인: 01#1 볼륨 핸들러 삭제 후 bot 테스트 4건 실패(`controllerButton.test.ts`)를 확인하고 해당 수정을 되돌린 뒤 전 테스트 통과.
- 패턴 재점검: games·voice 모듈 내 em dash(U+2014) 0건 확인.

## 리스크 / 병합 주의

- 01#3: `errorView`와 인라인 생성 결과가 동일(container + textDisplay 1개)한 치환이지만, 각 파일의 `createContainer` import는 성공 메시지에서 아직 사용되므로 제거하지 않음.
- 03#3: games 응답 컨테이너 생성 경로가 `textContainer`로 통합됨. `rpsResultContainer`는 ActionRow를 더 붙이므로 `textContainer` 결과에 `addActionRowComponents`를 추가하는 기존 구조 유지.
- 03#6: `GameId` 유니온이 3값으로 축소됨. `recordGameResult` 호출부 3곳만 사용하므로 타입체크 통과. DB에 'dice' 레거시 행이 있어도 문자열 컬럼이라 읽기 영향 없음.
- 01#5: 런타임 분기·에러 식별자('volume_invalid' 등)는 그대로라 동작 변경 없음, 주석만 추가.
- 01#1 DEFER: 컨트롤러 UI의 주석 처리된 볼륨 버튼 블록과 핸들러가 그대로 남아 있음. 삭제(테스트 4건과 함께) 또는 버튼 재노출 중 하나로 제품 결정이 필요.
- 01#6 DEFER: 이모지 표기 3종 혼재는 그대로 남아 있음. 앱 이모지 자산 추가 여부 결정이 선행되어야 하는 작업.
