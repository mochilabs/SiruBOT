FIXED: 27 / DEFERRED: 0 / N/A: 0

# FIX 리포트: 11 data-api services/providers/renderers/utils

- 수정 브랜치: `fix/data-api-services` (워크트리 `/home/seonu/.local/share/opencode/worktree/e08104/fix-data-api-services`)
- 커밋: `65fca5c6` fix(data-api): antislop 감사 세그먼트 11 수정 (카드 텍스트 대비·주석 슬롭·허브 중복) (push 없음)
- 수정 범위: `apps/data-api/src/{services,providers,renderers,utils}/**` 만. routes/plugins/config는 세그먼트 10 소관이라 수정하지 않음
- 근거 문서: `docs/antislop-audit/segments/11-data-api-services.md`
- 대비 측정 도구: `/home/seonu/.config/opencode/skills/antislop-human/contrast-check.py`

## finding별 처리

| 세그먼트#번호 | 우선순위 | 상태 | 변경 요약 | 파일:라인 (수정 후 기준) |
| --- | --- | --- | --- | --- |
| 11#1 | HIGH | fixed | 유저 대상 이미지 에러 4곳의 U+2014를 마침표로 치환하고 반복 문구를 상수 2개로 추출 | memberGreetingCard.ts:43,45,279,286,291,309 |
| 11#2 | HIGH | fixed | LIVE 뱃지 배경 #ff3b5c → #d11f3f (흰 글씨 3.48:1 → 5.28:1) | nowPlayingCard.ts:343 |
| 11#3 | HIGH | fixed | 헤더 그라디언트 시작색 #a98cd6 → #8a68bd, PROFILE 라벨 알파 0.8 → 1.0 (그라디언트 최악 지점 2.99:1 → 5.07:1) | profileCardDark.ts:167,168,217 |
| 11#4 | HIGH | fixed | 본문 흐린 잉크 알파 0.62 → 0.78, LIGHT_MUSIC_PAL.textMuted를 같은 상수로 통합 (크림 3.47:1 → 5.26:1, 카드 3.60:1 → 5.54:1) | profileCardTicket.ts:54,389 |
| 11#5 | HIGH | fixed | 역할 캡슐 글씨 #b97f7e → #7d4a49, #61826c → #46614f (2.31:1 → 5.01:1, 3.25:1 → 5.18:1) | profileCardTicket.ts:59,61 |
| 11#6 | HIGH | fixed | 온라인 캡슐 라벨을 SAGE_MID에서 SAGE_DEEP로 교체하고 미사용 SAGE_MID 상수 삭제 (3.60:1 → 4.52:1) | profileCardTicket.ts:51(삭제),283 |
| 11#7 | HIGH | fixed | 헤더·푸터 로즈 알파 합성색과 날짜·스탯 아이콘 로즈 리터럴 3곳을 ACCENT_ROSE(#8f544e)로 통합 (1.93:1/2.73:1 → 5.16:1) | profileCardTicket.ts:63,226,323,332,351,372 |
| 11#8 | HIGH | fixed | 스텁 PERSONAL PROFILE 라벨 알파 0.75 → 솔리드 #35473c (그라디언트 실제 라벨 위치 2.30:1 → 5.32:1). 리포트 제안 #3d5245는 같은 위치 4.53:1이라 교체 | profileCardTicket.ts:52,214 |
| 11#9 | HIGH | fixed | LIGHT_MUSIC_PAL의 accent·rankBg를 ACCENT_ROSE(#8f544e)로 교체 (카드 위 4.02:1 → 5.59:1, 랭크 숫자는 같은 색 쌍이라 동일 수치) | profileCardTicket.ts:63,391,395 |
| 11#10 | MEDIUM | fixed | renderers 비테스트 파일의 섹션 헤더 47건에서 장식 수미선만 제거하고 라벨과 괄호 안 실측 정보 유지 | profileCardTicket.ts:46,109,143,166,219,222,236,250,289,306,313,334,363,368 / profileCardDark.ts:46,122,151,155,205,222,238,254,263,284,311,318,323,352,357 / nowPlayingCard.ts:296,306,321,329,367,419,445,468,516 / ohaasaCard.ts:80,93,117,131,169,209 / profileWidgets.ts:66,112 / memberGreetingCard.ts:248 |
| 11#11 | MEDIUM | fixed | fetchLyrics의 정규식 복제본을 STRIP_PARENS로 교체하고 캐시 키만 소문자로 정규화한다는 차이를 주석에 명시 | lyrics.ts:6,15 |
| 11#12 | MEDIUM | fixed | 주소 접미사 정규식을 KR_ADMIN_SUFFIX 단일 상수로 두고 weather.ts가 import해 같은 기준으로 사용 | weatherLocality.ts:306,343 / weather.ts:2,81 |
| 11#13 | MEDIUM | fixed | 허브 상관 흐름(파싱, 스키마 검증, 메타 대조, 메타 정리, resolve) 3파일을 utils/hubCorrelate.ts 공용 헬퍼로 통합하고 파일별 기준·결과는 콜백으로 유지 | utils/hubCorrelate.ts:40 / guildDataHub.ts:59 / playerWebHub.ts:71 / jtcSetupHub.ts:54 |
| 11#14 | MEDIUM | fixed | chapters의 search·watch fetch 2곳에 AbortSignal.timeout(10초) 추가. 공용 fetchText/fetchJson 헬퍼 제안은 새 추상화라 채택하지 않음 | chapters.ts:16,83,114 |
| 11#15 | MEDIUM | fixed | data-api의 CHAPTER_FETCH_MIN_DURATION_MS 정의를 지우고 packages/utils export를 re-export하도록 교체 (utils 파일은 수정하지 않음) | chapters.ts:13 |
| 11#16 | MEDIUM | fixed | 별밭 주석을 실제 동작(별자리 코드로 시드 고정)에 맞게 정정하고 코드는 그대로 유지 | ohaasaCard.ts:51 |
| 11#17 | MEDIUM | fixed | 행운의 열쇠 아이콘을 lucide key 경로로 교체하고 사용처가 없어진 star 항목 삭제, 봇 추천 sparkle에는 사용 근거 한 줄 추가 | canvas/icons.ts:29,123 / ohaasaCard.ts:85 / nowPlayingCard.ts:349 |
| 11#18 | MEDIUM | fixed | 미사용 export 2개(ZODIAC_THEMES, CARRIER_ALIASES) 제거. CardPalette 6필드는 profileCardDark가 읽는 것을 확인해 유지(n-a) | ohaasaCard.ts:17 / delivery.ts:26 / profileWidgets.ts:21 (미변경) |
| 11#19 | LOW | fixed | 운영자 로그 5곳의 U+2014를 마침표·쉼표로 치환 (허브 불일치 로그 3곳은 공용 헬퍼로 이동) | canvas/fonts.ts:40,48 / utils/hubCorrelate.ts:61 |
| 11#20 | LOW | fixed | 랭크 배지 숫자 12px → 14px (배지 박스 22px는 유지) | profileWidgets.ts:165 |
| 11#21 | LOW | fixed | 제안된 우선 대상만 테스트 4파일 추가: weather 6건, delivery 3건, 다크 프로필 스모크 3건, 티켓 프로필 스모크 2건. 지명되지 않은 미테스트 모듈은 추가하지 않음 | providers/weather.test.ts / providers/delivery.test.ts / renderers/profileCardDark.test.ts / renderers/profileCardTicket.test.ts |
| 11#22 | LOW | fixed | 제목 주석을 실제 동작(최대 2줄 줄바꿈)으로 정정하고 canvasUtils 표와 shapes 헤더의 색 보간 표기를 색 변환(hexToRgba 재수출)으로 교체 | nowPlayingCard.ts:408 / canvasUtils.ts:9 / canvas/shapes.ts:2 |
| 11#23 | LOW | fixed | JSDoc의 하드코딩 숫자(1600, 0.82, 900KB, 1200, 200px)를 해당 상수명으로 교체 | memberGreetingCard.ts:268,316,324 |
| 11#24 | LOW | fixed | 카드 안 브랜드 fallback 두 값을 @sirubot/utils의 BOT_NAME으로 통일 | nowPlayingCard.ts:11,489,513,520 |
| 11#25 | LOW | fixed | 별자리 맵 이중 정의 위치를 봇 전체 경로로 기록 (유지 판정 유지) | providers/types.ts:3 |
| 11#26 | LOW | fixed | memoryTidy가 구현체 대신 TranslationProvider 인터페이스를 받도록 바꾸고 chatCompletion을 인터페이스에 추가 | providers/translate.ts:18 / services/memoryTidy.ts:14,115,188,230 |
| 11#27 | LOW | fixed | 갱신 경로 3곳의 4줄 블록(마지막 기록 + Redis 캐시 쓰기)을 commit() 헬퍼로 통합하고 호출 순서는 그대로 유지 | services/ohaasaScheduler.ts:40,48,58,63 |

부분 처리 메모: 11#14는 관례 통일용 공용 fetch 헬퍼를 채택하지 않고 chapters만의 타임아웃 누락만 메웠고, weather·delivery의 AbortController 방식은 그대로 두었습니다. 11#18은 세 하위 주장 중 CardPalette 미사용 필드 주장이 코드 확인 결과 사용처가 있어 n-a입니다. 11#21은 제안된 4곳만 추가했습니다.

## 검증

실행한 명령과 결과입니다. 모두 워크트리에서 실행했습니다.

| 명령 | 결과 |
| --- | --- |
| `yarn install` | 성공 (10.2초, peer dependency 경고만) |
| `yarn lint` | 10/10 task 성공. `@sirubot/data-api:lint`는 `All matched files use Prettier code style!` |
| `yarn typecheck` | 14/14 task 성공 |
| `yarn test --filter=@sirubot/data-api` | 26 test files / 191 tests 통과, 0 fail (수정 전 22파일/177테스트, 신규 4파일 14테스트) |
| `yarn test` (루트 전체) | 14/14 task 성공. data-api 26파일/191테스트 포함 전 워크스페이스 통과 |
| `yarn workspace @sirubot/data-api lint`, `yarn workspace @sirubot/data-api test` | 이 환경에서 `command not found: prettier` / `command not found: vitest`로 실패. 같은 명령이 메인 저장소에서도 동일하게 실패하는 환경 문제이며, 루트 turbo 스크립트로 동일 검증을 대체했습니다 |
| `cd apps/data-api && ../../node_modules/.bin/tsc --noEmit` | exit 0 |
| `grep -rc '──' apps/data-api/src/renderers (테스트 제외)` | 0건 (수정 전 47건) |

### 대비 측정 수치 (contrast-check.py)

| 대상 | 수정 전 | 수정 후 |
| --- | --- | --- |
| LIVE 뱃지 흰 글씨 | #ffffff on #ff3b5c = 3.48:1 | #ffffff on #d11f3f = 5.28:1 |
| 티켓 본문 흐린 잉크 (크림) | 알파 0.62 합성 #837f78 on #f3efe6 = 3.47:1 | 알파 0.78 합성 #67625c on #f3efe6 = 5.26:1 |
| 티켓 본문 흐린 잉크 (카드) | #86827d on #fbf8f2 = 3.60:1 | #68645f on #fbf8f2 = 5.54:1 |
| 핑크 역할 캡슐 글씨 | #b97f7e on #e8d4d2 = 2.31:1 | #7d4a49 on #e8d4d2 = 5.01:1 |
| 그린 역할 캡슐 글씨 | #61826c on #d6e4da = 3.25:1 | #46614f on #d6e4da = 5.18:1 |
| 온라인 캡슐 라벨 | #5d7a66 on #d6e4da = 3.60:1 | #4f6a58 on #d6e4da = 4.52:1 |
| 티켓 헤더 로즈 | 알파 0.55 합성 #caa69e on #f3efe6 = 1.93:1 | #8f544e on #f3efe6 = 5.16:1 |
| 티켓 푸터 로즈 | 알파 0.8 합성 #b8857e on #f3efe6 = 2.73:1 | #8f544e on #f3efe6 = 5.16:1 |
| 티켓 액센트 라벨 (카드) | #a96a64 on #fbf8f2 = 4.02:1 | #8f544e on #fbf8f2 = 5.59:1 |
| 티켓 랭크 숫자 (랭크 배지) | #fbf8f2 on #a96a64 = 4.02:1 | #fbf8f2 on #8f544e = 5.59:1 |
| 스텁 PERSONAL PROFILE (그라디언트 실제 라벨 위치) | 합성 #67806f on #aec3b5 = 2.30:1 (리포트 렌더 측정 2.33:1) | #35473c on #aec3b5 = 5.32:1 |
| 스텁 라벨에 리포트 제안색을 쓴 경우 | #3d5245 on #aec3b5 = 4.53:1 (4.5:1을 넘지만 여유가 없어 채택하지 않음) |  |
| 다크 헤더 PROFILE 라벨 (그라디언트 최악 지점) | 알파 0.8 합성 #eae4f1 on #9478b8 = 2.99:1 (리포트 렌더 측정 2.88~4.14:1) | #ffffff on #7f60a8 = 5.07:1 |
| 다크 헤더 핸들 (같은 스윕, 큰 글씨 3.0:1 기준) | 같은 시작색에서 2.85:1 (스윕 모델값) | #ffffff on #8262ac = 4.89:1 |
| 다크 헤더 sparkle 아이콘 (비텍스트 3.0:1 기준) | 같은 스윕 모델값 2.64:1 | #ffffff on #8564b3 = 4.70:1 |

측정 방법: 단색 조합은 contrast-check.py로 직접 산출했습니다. 그라디언트 위 두 항목(다크 헤더 PROFILE 라벨, 티켓 스텁 라벨)은 캔버스 선형 그라디언트 보간으로 위치별 합성색을 구한 뒤 같은 스크립트로 판정했고, 그 전제가 맞는지는 리포트의 렌더 측정치(스텁 2.33:1, 다크 헤더 2.88:1)와 스윕 결과(2.30:1, 2.99:1)를 대조해 확인했습니다. 시작색 #8a68bd는 profileCardDark.test.ts가 렌더 결과 픽셀로도 검증합니다.

## 리스크 / 병합 주의

동작 변경 사항입니다.

- 카드 색상 8종이 바뀝니다: LIVE 뱃지 배경, 티켓 본문 흐린 잉크, 역할 캡슐 글씨 2색, 온라인 캡슐 라벨, 헤더·푸터 로즈, 스텁 라벨, 음악 섹션 액센트와 랭크 배지. 렌더 이미지가 이전과 다르게 나옵니다.
- 다크 프로필 헤더 좌상단이 어두워집니다 (#a98cd6 → #8a68bd)고 PROFILE 라벨이 불투명 흰색이 됩니다. 같은 헤더의 핸들 텍스트와 sparkle 아이콘 대비도 함께 올라갑니다.
- 티켓 스텁 라벨 색이 리포트 제안(#3d5245) 대신 #35473c입니다. 제안색은 라벨 실제 위치에서 4.53:1이라 여유가 없어 한 단계 어두운 값을 골랐습니다.
- 랭크 배지 숫자가 12px에서 14px로 커집니다. 배지 박스 크기는 그대로입니다.
- 행운의 열쇠 아이콘이 별에서 lucide key로 바뀝니다. 사용처가 사라진 star 아이콘 항목은 DB에서 삭제했습니다.
- nowPlaying 카드의 브랜드 fallback이 'SiruBOT'과 '시루봇' 두 값에서 BOT_NAME('시루봇') 하나로 통일됩니다. 같은 카드에 두 이름이 같이 나오던 경로(중간 라인과 푸터)가 없어집니다.
- chapters 조회가 10초 타임아웃에 걸립니다. 이전에는 무제한으로 기다렸고, 타임아웃이 걸리면 챕터 없음(빈 배열)으로 처리됩니다.
- 유저 대상 이미지 에러 문구 2종이 마침표로 나뉜 두 문장이 되고, 400 응답 본문에 그대로 반영됩니다.
- 운영자 로그 문구 5곳(폰트 폴백 2, 허브 불일치 3)이 바뀝니다. 로그 검색 패턴을 쓰는 곳이 있으면 확인이 필요합니다.
- memoryTidy의 provider 타입이 구현체에서 인터페이스로 넓어졌고 TranslationProvider에 chatCompletion이 추가됐습니다. 런타임 동작은 그대로입니다.
- 세 허브의 상관 로직이 utils/hubCorrelate.ts로 옮겨갔습니다. 로그 문구는 `Ignored <hub> response <id>, <mismatch>` 형태로 바뀌었고(기존에는 U+2014 구분자), resolve 순서와 반환값은 그대로입니다.
- 병합 순서: `CHAPTER_FETCH_MIN_DURATION_MS`는 packages/utils의 export에 의존합니다. utils 쪽 브랜치를 먼저 확인하고 병합해야 data-api 빌드가 유지됩니다.
- 범위 밖 잔여: `apps/data-api/src/routes/**`에는 `──` 섹션 헤더가 24건 남아 있습니다(세그먼트 10 소관).
