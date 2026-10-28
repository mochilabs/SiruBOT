# FIX REPORT: packages/utils (antislop 감사 세그먼트 15 / 16 / 17)

FIXED: 32 / DEFERRED: 2 / N/A: 1

- 브랜치: fix/utils (워크트리 /home/seonu/.local/share/opencode/worktree/e08104/fix-utils)
- 커밋: b86cc62d `refactor(utils): antislop 감사 세그먼트 15~17 수정 (주석 슬롭·죽은 코드·복제 통합·테스트 보강)` (push 없음)
- 수정 범위: packages/utils/** 만. apps/** 및 다른 packages는 수정하지 않음.

## Finding별 처리 표

| 세그먼트#번호 | 심각도 | 상태 | 변경 요약 | 파일:라인(현재) |
| --- | --- | --- | --- | --- |
| 15#1 | MEDIUM | fixed | appEmoji 헤더 사용 규칙을 실제 심볼명(`emoji()`, `APP_EMOJI_FALLBACKS`)으로 정정하고 존재하지 않는 `e(`·EMOTIONS 표기 제거 | packages/utils/src/appEmoji.ts:14-20, 26-28 |
| 15#2 | MEDIUM | fixed | format.ts의 `'related_track'` 리터럴을 유틸 내 센티널 상수 `RELATED_TRACK_REQUESTER_ID`로 치환하고 가드 주석 정정. 봇 5파일 6곳 통합은 apps/bot 소관이라 DEFER | packages/utils/src/format.ts:44-51 |
| 15#3 | MEDIUM | fixed | 외부 호출 0건(전체 저장소 grep으로 재확인)인 `MemoryCache.clear()`·`cleanup()` 메서드 제거 | packages/utils/src/memoryCache.ts:49-67 |
| 15#4 | MEDIUM | fixed | 빈 결과 미캐시·30초 재시도 계약을 JSDoc 한 곳으로 모으고 헤더·플래그·본문 주석은 각 줄의 이유만 남김 | packages/utils/src/appEmoji.ts:14, 135, 172, 182-184 |
| 15#5 | LOW | fixed | 주석을 바로 아래 검증·구현과 문자 그대로 일치하도록 교체("subscribe까지 끝난 뒤에도 this.subscriber에 올리지 않고 즉시 quit") | packages/utils/src/redisSubscriber.test.ts:93 |
| 15#6 | LOW | fixed | initSentry의 DSN 부재 분기·서비스 태그, registerProcessErrorHandlers의 capture+flush(2000)+exit(1) 테스트 추가 | packages/utils/src/sentry.test.ts:50-106 |
| 15#7 | LOW | fixed | 빈 결과 미캐시·loadPromise 리셋·30초 예약 재시도 1회·이름 정규식 방어 테스트 추가(fs 목 + fake timer) | packages/utils/src/appEmoji.test.ts:21-70 |
| 15#8 | LOW | fixed | scrubSecrets JSDoc을 한 줄로 축약. 보안 근거·두 패턴 설명은 위 상수 주석(57-62)에 유지 | packages/utils/src/sentry.ts:68 |
| 15#9 | LOW | fixed | 바로 위 조건을 재서술하던 영문 주석 삭제. `else` 래퍼도 반환 직후라 함께 정리(행동 동일) | packages/utils/src/format.ts:133-139 |
| 15#10 | LOW | fixed | 바로 아래 단언을 반복하던 주석 1줄 삭제 | packages/utils/src/memoryCache.test.ts:108, 117 |
| 15#11 | LOW | fixed | timeoutResult 선 계산 규약을 옵션 `onTimeout` JSDoc 1곳으로 통일, 헤더는 참조 1줄로 축약, register 문서는 동기 호출 사실만 유지 | packages/utils/src/pendingRequestPool.ts:11, 28, 53 |
| 15#12 | LOW | fixed | 진행바 스텝 수 설명을 구현 기준(6셀 x 2스텝 = 전체 12스텝, 상태값 s는 0~12) 하나로 통일 | packages/utils/src/constants.ts:13-15, 27 |
| 15#13 | LOW | deferred | data-api memoryTidy의 지역 `sleep` 제거는 apps/data-api 소관(이 에이전트 수정 범위 밖). utils 쪽 `sleep` export는 유지 | apps/data-api/src/services/memoryTidy.ts:72 |
| 15#14 | LOW | fixed | 소비처 0건(grep 재확인)인 `DEFAULT_COLOR_HEX` 상수와 배럴 재노출 2곳(index·client) 제거 | packages/utils/src/constants.ts, index.ts:8, client.ts:9 |
| 16#1 | MEDIUM | fixed | `// --- 라벨 ---` 장식 구분선 5곳을 라벨 텍스트만 남긴 일반 한 줄 주석으로 교체 | packages/utils/src/customCommand.ts:51, 56, 77, 112, 201 |
| 16#2 | MEDIUM | n-a | utils 내 중복 정의 없음(lavalinkTrack.ts:7의 단일 정의)을 확인하고 export 유지. data-api 정의를 import로 교체하는 일은 data-api 에이전트 소관 | packages/utils/src/lavalinkTrack.ts:7 |
| 16#3 | LOW | fixed | 소비처 없는 `metadata` 매핑과 `YouTubeSuggestion.type` 필드 제거, 테스트 헬퍼 갱신 | packages/utils/src/youtube.ts:3-13, 44-56 |
| 16#4 | LOW | fixed | 응답 `guildId`를 요청부와 같은 `redisIdSchema`로 통일해 키 주입 방지 규칙을 응답 검증까지 확장 | packages/utils/src/playerWeb.ts:93 |
| 16#5 | LOW | fixed | 헤더의 v1/v2 버전 이력 2줄 삭제, 스키마 동기화 지침은 유지 | packages/utils/src/customCommand.ts:8-9 |
| 16#6 | LOW | fixed | JSONP 파싱 성공, 정규식 불일치, HTTP 실패 3케이스 테스트 추가(undici fetch 목) | packages/utils/src/youtube.test.ts:34-54 |
| 16#7 | LOW | fixed | 라운드트립 픽스처의 이모지 장식 유저 에러를 이모지 없는 안내문으로 교체 | packages/utils/src/playerWeb.test.ts:106, 109 |
| 17#1 | HIGH | fixed | 대시보드 변수 칩 설명 문자열의 U+2014 문자를 괄호 구조("...(봇 메시지 전용, 이미지 카드에는 못 써요)")로 치환 | packages/utils/src/memberGreeting.ts:317 |
| 17#2 | MEDIUM | fixed | `// --- 라벨 ---` 5곳 중 4곳은 라벨만 남기고, JSDoc이 바로 이어지는 `// --- 템플릿 변수 ---`는 삭제 | packages/utils/src/memberGreeting.ts:121, 204, 249, 313 |
| 17#3 | MEDIUM | fixed | embedFix·og의 구분선 2곳을 계약 설명만 남긴 한 줄 주석으로 교체 | packages/utils/src/chatTools/embedFix.ts:202, chatTools/og.ts:94 |
| 17#4 | MEDIUM | fixed | 재수출 셸 헤더에서 하위 모듈 문서를 복사한 리스너·프로바이더 계약 5줄 제거, 모듈 목록과 배럴 경로·"각 모듈 헤더 참조"만 유지 | packages/utils/src/chatTools.ts:1-13 |
| 17#5 | MEDIUM | fixed | 기본 환영 설정과 classic-center 템플릿이 완전 복제하던 레이어 3종을 `CLASSIC_CENTER_LAYERS` 단일 소스로 합치고 `structuredClone`으로 각각 독립 복제 | packages/utils/src/memberGreeting.ts:204-210, 222, 263 |
| 17#6 | LOW | fixed | 같은 파일 안 중복 문장 2건 제거(모듈 헤더 쪽 1곳 유지) | packages/utils/src/chatTools/counting.ts:37, chatTools/emoji.ts:11 |
| 17#7 | LOW | fixed | DeliveryError·WeatherError 복제는 유지하고 서브패스별 단일 홈 정책이라는 이유를 한 줄 주석으로 각각 남김(새 베이스 클래스는 추가하지 않음) | packages/utils/src/delivery.ts:9, weather.ts:11 |
| 17#8 | LOW | fixed | 무소비자 export 2개 제거. `absolutizeUrl`은 함수 유지 + export만 제거, `parseAssetKey`는 저장소 밖·테스트 외 소비자 0건이라 함수와 테스트 단언까지 삭제 | packages/utils/src/chatTools/og.ts:44, storage.ts:54 |
| 17#9 | LOW | fixed | 파일 내부 전용 상수 4개의 `export` 키워드 제거(값과 내부 사용 유지) | packages/utils/src/chatTools/messageLink.ts:8, chatTools/embedFix.ts:45, 205, memberGreeting.ts:332 |
| 17#10 | LOW | fixed | `renderGreetingTemplate`의 4개 변수 치환과 mention(null) 표시 이름 폴백 테스트 2케이스 추가 | packages/utils/src/memberGreeting.test.ts:46-68 |
| 17#11 | LOW | fixed | DATA_URI 허용 형식, 1.5MB 상한, 텍스트 size 12~160 한도, 모르는 프리셋 거부 테스트 4케이스 추가 | packages/utils/src/memberGreeting.test.ts:70-100 |
| 17#12 | LOW | fixed | `assetNameSchema` 빈 이름 거부와 60자 초과 거부 2케이스 추가 | packages/utils/src/storage.test.ts:40-50 |
| 17#13 | LOW | deferred | 텍스트 size 하단 12 -> 21 상향은 기존 저장된 v2 설정이 검증을 통과하지 못해 기본값으로 폴백되는(사용자 설정 유실) 행동 변경 위험이 있어 보류. 에디터 쪽 최소 크기 제한은 대시보드 소관 | packages/utils/src/memberGreeting.ts:128, 22 |
| 17#14 | LOW | fixed | 선언에 붙지 않고 상단에 떠 있던 좌표계 JSDoc을 `GREETING_CARD_W` 문서로 병합해 한 곳에만 남김 | packages/utils/src/memberGreeting.ts:14-19 |

## 검증

워크트리에서 실제로 실행한 명령과 결과입니다.

| 명령 | 결과 |
| --- | --- |
| `yarn install` | 성공. `Done with warnings in 10s 339ms` |
| `yarn workspace @sirubot/utils lint` | 실패: `command not found: prettier`(워크트리 workspace 스크립트 PATH 이슈). 동일 스크립트를 `yarn turbo lint --filter=@sirubot/utils`로 실행 |
| `yarn prettier --write packages/utils/src/sentry.test.ts` | 서식 경고 1건 수정 |
| `yarn turbo lint --filter=@sirubot/utils` | 통과: `All matched files use Prettier code style!` |
| `yarn turbo test --filter=@sirubot/utils` | 통과: `Test Files 31 passed (31)`, `Tests 325 passed (325)` |
| `yarn typecheck`(전체 리포) | 1차 실행: `@sirubot/utils`에서 appEmoji.test.ts:29 TS2345 1건(오버로드 한정). `emoji('a', '(폴백)')` 2인자 호출로 수정 후 재실행: `Tasks: 14 successful, 14 total`(bot·dashboard·data-api·storage 등 전 앱 포함) |
| `git diff -U0 \| grep '—'` | 추가된 줄의 U+2014는 전부 기존 주석 문구 보존분이며, 새로 작성한 주석의 U+2014는 0건 |

미수행 항목(사실 기록): 루트 전체 `yarn test`/`yarn lint`는 다른 에이전트 범위라 실행하지 않았고, 봇/디스코드/Redis/Lavalink 연결을 필요로 하는 런타임 실행도 하지 않았습니다.

## 리스크 / 병합 주의

- export 제거(하위 호환 주의): `DEFAULT_COLOR_HEX`(루트 배럴 + `@sirubot/utils/client`), `parseAssetKey`(`@sirubot/utils/storage`), `MESSAGE_LINK_MAX`, `EMBED_FIX_LINK_MAX`, `EMBED_FIX_METADATA_LINK_MAX`, `PRESET_BACKGROUND_IDS`를 제거했습니다. 저장소 전체 grep에서 정의·테스트 외 소비자 0건을 확인하고 전체 타입체크가 통과했지만, 저장소 밖 코드가 이 이름들을 쓰면 import 실패가 납니다.
- 대시보드 주석 1건이 사실이 아니게 됐습니다: `apps/dashboard/src/components/servers/member-greeting/greeting-section.tsx:34-39`는 "원본은 packages/utils constants.ts의 DEFAULT_COLOR_HEX"라고 설명하지만, 이제 해당 상수가 없습니다. 대시보드 에이전트가 갱신하면 좋습니다(이 에이전트는 apps/** 수정 금지).
- `playerWeb` 응답 `guildId` 검증이 `redisIdSchema`로 엄격해졌습니다: 1~32자 영문·숫자·`_`·`-`만 통과합니다. 요청부와 같은 규칙이라 정상 봇 응답은 그대로 통과하며, 기존에 응답에서 통과하던 `'guild:1'`류 값이 거부되는 것은 finding 의도대로의 변경입니다.
- `youtube.ts` 인터페이스 축소: `YouTubeSuggestion.type`, `YouTubeSuggestionsResponse.metadata`를 제거했습니다. 저장소 내 소비자는 `getSimpleYouTubeSuggestions`뿐임을 확인했으나, 서브패스 타입을 직접 임포트한 외부 코드가 있으면 타입 오류가 납니다.
- `format.ts`에 새 export `RELATED_TRACK_REQUESTER_ID`가 추가됐습니다. `apps/bot/src/modules/audio/lavalink/requester.ts:10`의 상수와 값이 같아야 합니다. 봇 상수를 이 import로 전환하는 정리는 봇 에이전트 소관으로 남았고(15#2 부분 DEFER), 값이 같아 병합 순서 충돌은 없습니다.
- `MemoryCache.clear()`/`cleanup()` 제거: 저장소 내 소비자 0건이나, 이후 필요 시 재구현해야 합니다.
- memberGreeting classic-center와 `DEFAULT_WELCOME_GREETING`이 이제 `CLASSIC_CENTER_LAYERS` 한 곳을 `structuredClone`으로 공유합니다. 레이어를 고치려면 이 상수 한 곳만 수정하면 둘 다 반영됩니다. `DEFAULT_GOODBYE_GREETING`의 아바타 레이어는 값이 같지만 텍스트가 달라 finding 범위 밖으로 그대로 뒀습니다(추가 복제로 남음).
- 17#13(size 하단 상향)과 15#13(data-api sleep)은 위 표의 deferred 사유 그대로 후속 작업이 필요합니다.
