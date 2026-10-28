FIXED: 28 / DEFERRED: 2 / N/A: 0

# FIX 리포트: 02 bot general + 04 bot core·services

- 수정일: 2026-10-23
- 수정 브랜치: `fix/bot-general-core` (워크트리 `/home/seonu/.local/share/opencode/worktree/e08104/fix-bot-general-core`)
- 커밋: `905688db` fix(antislop): 봇 general·core/services 감사 finding 수정 (02·04 세그먼트) (미push, 작업 트리 청정)
- 근거 문서: `docs/antislop-audit/segments/02-bot-general.md`, `docs/antislop-audit/segments/04-bot-core-services.md`
- 수정 범위: `apps/bot/src/modules/general/**`, `apps/bot/src/{core,services,lib,types}/**`, `apps/bot/src/index.ts` (`index.ts` 변경 없음)
- diff 규모: 커밋 기준 57개 파일, +337 / -404 (신규 파일 5개: general/utils의 channels·greetingDispatch·uptime·chatView.test, services/customCommands/context)

## Finding별 처리

| 세그먼트#번호 | 우선순위 | 상태 | 변경 요약 | 파일:라인 (수정 후 기준) |
| --- | --- | --- | --- | --- |
| 02#1 | HIGH | fixed | `!도움말` 목록 줄 구분자 em dash(U+2014)를 `·`로 치환 (유저 노출 문자열) | modules/general/listeners/message/customCommandPrefix.ts:128 |
| 02#2 | HIGH | fixed | presence 미관측 멤버를 online으로 단정하지 않음. 관측한 status만 전달하고 `offline`/`invisible`은 카드가 그리는 `invisible`(오프라인)로 매핑, 미관측이면 `statusLabel`을 `상태 알 수 없음`으로 전달 | modules/general/commands/profile.ts:286-293, 318-319 |
| 02#3 | MEDIUM | fixed | 채널 목록 수집 3중복을 `collectOtherTextChannelIds` 한곳으로 통합. 제안의 guildService 대신 `general/utils/channels.ts`에 둠: 캐시 필터일 뿐이고 guildService는 설정 퍼사드(위임 전용)라 책임이 맞지 않다고 판단 | modules/general/utils/channels.ts:7 / commands/tts.ts:93 / commands/chatTools.ts:123 / commands/chatSettings.ts:95 |
| 02#4 | MEDIUM | fixed | member/guild 어댑터 블록과 실패 안내문 3종을 `services/customCommands/context.ts`로 추출해 접두사·슬래시 두 진입점이 공유. 명령어 표기(`!이름` vs `/이름`)만 호출부에서 전달 | services/customCommands/context.ts:9,19,31 / listeners/message/customCommandPrefix.ts:83,103 / listeners/interaction/customCommandSlash.ts:54,66 |
| 02#5 | MEDIUM | fixed | 채널 턴 확보, 유저 턴 소모, 실패 시 채널 턴 회수의 불변식을 `acquireChatTurn` 한곳으로 이동. 안내 문구는 ephemeral reply와 채널 reply의 배달 방식·문맥이 달라 진입점에 유지 (문구 변경 없음) | services/aiChat/turnControl.ts:31 / commands/chat.ts:96 / listeners/message/mentionReply.ts:60 |
| 02#6 | MEDIUM | fixed | 1줄 디버그 로그를 만드는 단일 사용 헬퍼 5개 체인을 `run` 안 포맷팅으로 병합 (로그 문자열 형식 동일) | modules/general/listeners/commands/chatInputCommands/chatInputCommandSuccess.ts:6-14 |
| 02#7 | LOW | fixed | 등록하지 않는 이벤트용 else 분기와 미사용 payload 타입(ContextMenu/MessageCommandSuccess) 제거. 02#6 재작성에서 함께 처리 | chatInputCommandSuccess.ts:6 |
| 02#8 | LOW | fixed | 미사용 `findMany` 목과 `void findMany;` 제거 | modules/general/listeners/interaction/customCommandSlash.test.ts:6, 67 |
| 02#9 | LOW | fixed | 140자 ephemeral 판정식 2중복을 `resolveErrorEphemeral`로 통합 (판정 결과 동일: UserError는 context 값, 그 외 true) | lib/errorView.ts:18 / listeners/commands/chatInputCommands/chatInputCommandError.ts:35 / listeners/interactionHandlerError.ts:32 |
| 02#10 | LOW | fixed | 입·퇴장 리스너의 dispatch payload와 try/catch를 `dispatchMemberGreeting`으로 통합. 로그 라벨은 kind(welcome/goodbye)에서 파생 | modules/general/utils/greetingDispatch.ts:9 / listeners/member/guildMemberAdd.ts:14 / guildMemberRemove.ts:15 |
| 02#11 | LOW | fixed | 업타임 분해 4줄 2중복을 `formatDayHourMinute`로 통합. 기존 `formatUptime`은 `N일 N시간` 형식이라 분 단위가 빠져 출력 보존을 위해 동일 결과 헬퍼를 신설 | modules/general/utils/uptime.ts:2 / subcommands/bot.ts:28 / commands/development/nodes.ts:58 |
| 02#12 | LOW | fixed | 코드가 이미 말하는 영문 라벨 주석 제거 | commands/development/shards.ts:55 인접 (제거) |
| 02#13 | LOW | fixed | 조건문을 번역한 영문 주석 제거 | listeners/guild/guildDeleted.ts:12 인접 (제거) |
| 02#14 | LOW | fixed | 조건문을 번역한 영문 주석 제거 | listeners/commands/message/messageDeleted.ts:17 인접 (제거) |
| 02#15 | LOW | fixed | 분기 조건 재서술 주석 제거. 같은 파일의 Sentry 분기는 의도(비UserError만 보고)가 아래 블록과 `interactionHandlerError.ts:13`에 남아 있어 추가 주석은 없앰 | chatInputCommandError.ts:15 인접 (제거) |
| 02#16 | LOW | fixed | 블록 동작을 반복하는 라벨 주석 제거 (판정식·followUp 분기 주석은 02#9 수정 시 설명이 붙어 있어 별도 추가 없음) | listeners/interactionHandlerError.ts:30 인접 (제거) |
| 02#17 | LOW | fixed | `splitTextForDisplay` 경계 테스트 4건 추가: 3900자 경계(1조각), 3901자(2조각 분할), 코드펜스 앞 단절, 20000자 4청크 초과 잘림. 비공개 함수라 export 대신 공개 `finalPayload` 경유로 검증 | modules/general/utils/chatView.test.ts:10 |
| 04#1 | MEDIUM | fixed | 시그니처를 반복하는 영문 JSDoc 7곳 삭제 (audioService 3, skipPolicy 1, guildSettings/store 1, playlistService 1, bootstrap 1). `core/logger.ts`는 tslog 레벨 매핑이라는 사실이 정보라 한국어 한 줄로 교체 | services/audioService.ts:16,95,286 / services/skipPolicy.ts:24 / services/guildSettings/store.ts:21 / services/playlistService.ts:8 / core/bootstrap.ts:167 인접 / core/logger.ts:5 |
| 04#2 | MEDIUM | fixed | AI 도구 이전곡·정지와 웹 제어 정지의 인라인 6줄 시퀀스를 `audioService.playPrevious`/`stopPlayback` 호출로 치환 (갈라져 있던 정지 흐름 3중복 통일) | services/aiTools/music.ts:153,288 / services/playerWebResponder.ts:394 |
| 04#3 | MEDIUM | fixed | 카드 렌더 fetch 3중복(15줄)을 `renderImage(path, body)`로 통합해 타임아웃 상수, content-type 검증, null 폴백을 한곳에 배치 | services/dataApiClient.ts:39,201,208,230 |
| 04#4 | MEDIUM | fixed | 구독 서비스가 7개인데 4개로 적힌 주석을 개수 없는 표현으로 교체 (숫자 고정은 재생성 위험이 있어 채택하지 않음) | core/botApplication.ts:111 |
| 04#5 | LOW | deferred | 로거 인라인/중복 타입 8곳은 `services/types.ts`의 `ServiceLogger`로 통일(적용). `stop()` 4줄 7중복 공용 헬퍼와 반복 주석 문구 통일은 미적용: `subscriber`가 private이라 헬퍼 호출에 캐스터가 필요하고, 4줄 고정 패턴에 간접층만 추가되는 구조라 되돌림 위험이 큼 | services/types.ts:10 + botProfileService.ts:58 / guildDataResponder.ts:55 / guildSettingsInvalidator.ts:55 / jtcSetupResponder.ts:40 / memberGreetingService.ts:111 / playerWebResponder.ts:82 / socialWebhookResponder.ts:42 / customCommands/slashRegistry.ts:62,73 (통일), stop() 7곳 미변경 |
| 04#6 | LOW | fixed | 파일 내 import 별칭 래퍼 2곳 제거, `checkDJRole`의 미사용 boolean 반환 제거. 테스트가 반환값을 단정하고 있어 무시된다는 감사 전제와 달라, 단정을 반환 타입에 맞춰 갱신(거절 케이스 테스트는 그대로) | services/trackService.ts:8,27 / services/playlistService.ts:79 / services/skipPolicy.ts:151 / services/skipPolicy.test.ts:145,156-158 |
| 04#7 | LOW | fixed | 반복 부호로 감싼 장식 구분선 주석 10곳을 평문 한 줄로 교체 (내용 보존, 연결 부호만 치환) | services/playerWebResponder.ts:183,209,245,323 / core/env.ts:22,38,58,69 / services/types.ts:17,35 |
| 04#8 | LOW | fixed | 외부 임포트가 없는 export 16종 제거. `CustomCommandGuildContext`·`CustomCommandMemberContext`·`CustomCommandRunResult` 3종은 02#4 수정으로 `context.ts`가 실제 임포트하는 공개 계약이 되어 유지 (제안의 "사용처 연결"에 해당) | core/env.ts:85 / services/chatTts.ts:28,34 / services/customCommands/interpreter.ts:41,52,46 / services/dataApiClient.ts:117,161,221 / services/ttsService.ts:27,45 / services/playbackReporter.ts:5,7 / services/webhookRelay.ts:26 / services/memberGreetingService.ts:85 / services/aiMemoryService.ts:26 |
| 04#9 | LOW | fixed | 숫자 단계 라벨 4개 제거 후 사실(오프라인 폴백, 커밋 매핑 우선, shard 0 전용 업로드, 빈 맵 미주입)만 본문 주석으로 유지 | services/appEmojiManager.ts:31,37,49,54 |
| 04#10 | LOW | fixed | 동일 안내문의 이모지 접두를 통일. 제안의 "한쪽으로 통일" 중 이모지 쪽 채택: 같은 파일의 다른 error 안내 4건 중 3건이 이미 이모지 접두 | services/playerWebResponder.ts:341,422 |
| 04#11 | LOW | fixed | 안내문 이모지 뒤 이중 공백 2곳을 공백 1개로 통일 | services/audioService.ts:111,119 |
| 04#12 | LOW | fixed | 줄임표 표기 통일: 기존 30곳의 `중..`(2점)에 맞춰 폴백 1곳과 그 계약을 적은 JSDoc 1곳을 `사용 중..`으로 교체 | services/aiTools/index.ts:45 / services/aiTools/types.ts:21 |
| 04#13 | LOW | deferred | 미테스트 생산 파일 45개 보강은 범위가 넓고 파일마다 목·fixture 작성 비용이 커 별도 과제로 이관. 이번에는 02#17로 지명된 함수만 테스트 추가 | 미변경 |

## 검증

워크트리에서 실제로 실행한 명령과 결과입니다.

- `yarn install` (worktree 루트): 성공. peer dependency 경고만 출력.
- `yarn generate`: 성공 (Prisma Client가 `packages/prisma/dist`에 생성). 생성 전에는 `botApplication.test.ts`·`gameRecords.test.ts`가 `Failed to resolve entry for package "@sirubot/prisma"`로 실패함을 확인.
- `yarn turbo lint --filter=@sirubot/bot`: 성공. `All matched files use Prettier code style!`, Tasks 1 successful.
- `yarn prettier --check "apps/bot/src/**/*.ts"` (루트에서 직접): 처음 실행 시 수정한 파일 5개가 warn. `yarn prettier --write`로 해당 5개 파일만 포맷 후 재실행하여 `All matched files use Prettier code style!`.
- `yarn turbo typecheck --filter=@sirubot/bot`: 성공, Tasks 4 successful.
- `yarn tsc --noEmit -p apps/bot/tsconfig.json`: exit 0.
- `yarn turbo test --filter=@sirubot/bot`: 성공. `Test Files 49 passed (49) / Tests 525 passed (525)`.
- `yarn vitest run --config vitest.config.ts apps/bot` (직접 실행): 49 passed / 525 passed.
- `yarn vitest run --config vitest.config.ts` (루트 전체): `Test Files 156 passed (156) / Tests 1422 passed (1422)`.
- `yarn turbo lint:fix` (pre-commit 훅과 동일한 명령): exit 0, 실행 후 `git status --short` 비어 있음 (훅이 바꾸는 파일 없음).
- 최종 상태 재검증 (주석 구두점 치환 후, 커밋 `905688db` 기준): `yarn turbo lint --filter=@sirubot/bot` 성공, `yarn turbo test --filter=@sirubot/bot` 49 passed / 525 passed, `yarn turbo typecheck --filter=@sirubot/bot` Tasks 4 successful, `yarn vitest run --config vitest.config.ts` (루트 전체) 156 passed / 1422 passed, 작업 트리 청정(`git status --short` 0건).
- 중간 게이트: `checkDJRole` 반환 제거 후 `skipPolicy.test.ts` 1건이 `expected undefined to be true`로 실패한 것을 확인하고, 해당 단정을 반환 타입에 맞춰 갱신한 뒤 전체 통과.
- 중간 실수 기록: 주석 치환 스크립트 2회를 기본 workdir(메인 저장소)로 실행했으나, 첫째는 대상 문자 불일치, 둘째는 파일 오픈 예외로 각각 쓰기 단계 전 중단되어 메인 저장소는 무변경임을 `git diff`로 확인. 워크트리에서 잘못 들어간 주석 들여쓰기 6줄은 되돌린 뒤 위 게이트를 다시 돌렸습니다.
- 환경 참고: `yarn workspace @sirubot/bot lint`, `yarn workspace @sirubot/bot test`는 이 샌드박스에서 `command not found: prettier`, `command not found: vitest`로 실패 (yarn workspace 스크립트 PATH 문제, 브랜치/코드와 무관). turbo 경유 또는 루트 직접 실행으로 동일 명령을 수행했습니다.
- 재검사: 수정 후에도 유저 노출 문자열의 em dash(U+2014)는 `customCommandPrefix.ts:128` 치환만으로 0건 (02 세그먼트 grep 기준).

## 리스크 / 병합 주의

동작이 바뀐 항목은 다음과 같습니다.

- 02#2 (HIGH): presence를 받지 못한 멤버의 프로필 카드 상태 캡슐이 `온라인`에서 `상태 알 수 없음`으로 표시됩니다. 봇에 `GuildPresences` 인텐트가 없어(`core/bootstrap.ts:83-92`) 실질적으로 대부분의 프로필이 이 표시로 바뀝니다. 데이터의 `status`도 `online` 단정이 제거되어 data-api의 `statusLabelMap`을 그대로 태우거나 `상태 알 수 없음`을 덮어씁니다. 참고로 다크 프리셋의 상태 점 색은 `apps/data-api/src/routes/render.ts:100`이 항상 `#3ecf8e`로 넣어 초록으로 고정돼 있고, 라벨만 정직하게 바뀝니다 (data-api는 이번 수정 범위 밖이라 손대지 않음). 프로필 관련 테스트 파일은 존재하지 않아 갱신 대상이 없었습니다.
- 02#1 (HIGH): `!도움말` 목록의 줄 구분자가 em dash에서 `·`로 바뀝니다.
- 04#2 (MEDIUM): AI 도구 `music_stop`과 웹 플레이어 `stop`이 이제 `audioService.stopPlayback`을 씁니다. `clearNextLenient`(1회 재시도 후 로그)로 슬롯 정리를 하고 `stopPlaying`/`disconnect` 실패를 삼키므로, 이전에는 도구 실행 오류 또는 웹 제어 `제어를 적용하지 못했어요` 오류로 전파되던 경로가 성공 응답으로 바뀝니다. 이전곡은 기존 인라인과 시퀀스가 동일해 영향 없음.
- 04#3 (MEDIUM): 카드 렌더 실패 로그 접두가 라벨에서 요청 경로로 바뀝니다 (`[data-api] nowplaying-card failed:` 계열에서 `[data-api] /v1/image/nowplaying failed:` 계열). 로그 포맷만 바뀌고 반환 동작(실패 시 null)은 동일합니다.
- 04#10 (LOW): 웹 제어 DJ 권한 안내 문자열에 이모지 접두가 추가됩니다.
- 04#12 (LOW): AI 도구 폴백 멘트가 `사용 중...`에서 `사용 중..`으로 바뀝니다.
- 04#6 (LOW): `skipPolicy.test.ts`의 단정 1건이 `resolves.toBe(true)`에서 `resolves.toBeUndefined()`로 바뀝니다. 제품 동작은 불변이며, 권한 없음 거절 테스트는 그대로입니다.
- 02#4, 02#5, 02#9, 02#10, 02#11, 04#1, 04#7, 04#9: 문구·분기·출력을 그대로 유지한 통합/삭제입니다.

병합 주의 (강조):

- `apps/bot/src/services/chatTts.ts`는 메인 트리에서 사용자가 미커밋으로 수정 중인 파일입니다. 이 워크트리의 변경은 `export const TTS_GUILD_CONCURRENT_SYNTH`와 `export interface TtsTextResolvers`의 `export` 키워드 제거 2줄뿐이라, 병합 시 해당 2줄만 재적용하고 사용자의 미커밋 작업 내용은 절대 덮어쓰지 말아야 합니다. 충돌 가능성이 가장 높은 파일입니다.
- 04#5의 `stop()` 7곳과 반복 주석 문구는 그대로 남아 있습니다. 후속 작업 시 private 필드 구조를 먼저 확인하세요.
- 이 브랜치는 `fix/bot-general-core`에만 커밋했고 push는 하지 않았습니다 (`905688db`).
