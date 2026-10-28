FIXED: 20 / DEFERRED: 2 / N/A: 0

# FIX 리포트: 10 data-api routes/plugins/config + 18 packages/prisma

- 수정 브랜치: `fix/data-api-routes-prisma` (워크트리 `/home/seonu/.local/share/opencode/worktree/e08104/fix-data-api-routes-prisma`)
- 커밋: `29e531b7` refactor: data-api 라우트 antislop 감사 수정 / `7aba664f` chore: prisma 스키마·마이그레이션 주석 슬롭 정리 (push 없음)
- 수정 범위: `apps/data-api/src/{routes,plugins,config}` + `packages/prisma/**`. `services/ providers/ renderers/ utils/`는 다른 에이전트 소유라 수정하지 않음
- 근거 문서: `docs/antislop-audit/segments/10-data-api-routes.md`, `docs/antislop-audit/segments/18-prisma.md`

## finding별 처리

| 세그먼트#번호 | 우선순위 | 상태 | 변경 요약 | 파일:라인 (수정 후 기준) |
| --- | --- | --- | --- | --- |
| 10#1 | HIGH | fixed | 인사 카드 이미지 400 메시지의 연결 문자를 마침표로 바꿔 두 문장으로 분리 | apps/data-api/src/routes/render.ts:141 |
| 10#2 | MEDIUM | fixed | routes 섹션 헤더 24곳에서 `──` 장식만 제거하고 라벨과 괄호 안 실측 정보 유지 (guild-data 8 · render 5 · player 5 · cache-providers 4 · ai 1 · ohaasa 1) | cache-providers.ts:18,37,59,82 / render.ts:24,118,160,186,268 / player.ts:32,64,78,122,211 / guild-data.ts:57,72,94,133,186,220,230,250 / ai.ts:14 / ohaasa.ts:16 |
| 10#3 | MEDIUM | fixed | `stripCodeFences`를 customCommandDraft.ts에 export하고 customCommandRefine.ts의 동일 복제본과 중복 주석을 제거 | customCommandDraft.ts:72 / customCommandRefine.ts:13 (복제본 :47~53 삭제) |
| 10#4 | MEDIUM | fixed | 도메인 에러 name 검사 후 400을 조립하는 4줄 블록 3곳을 common.ts의 `sendDomainError(reply, error, fallbackCode)`로 통합 | common.ts:34~39 / cache-providers.ts:54,77 / render.ts:178 |
| 10#5 | MEDIUM | fixed | 소셜 경로 파라미터 400 블록 4회를 `parseParamsOr400` 헬퍼로 통합 (파라미터 전용이라 common이 아닌 social.ts에 배치) | social.ts:68~76 / :80,87,94,101 |
| 10#6 | MEDIUM | fixed | Redis 미연결 503 분기와 주석 3회를 `requireRedisClient(reply, message)`로 통합, 메시지는 인자로 유지 | guild-data.ts:33~41 / :84,167,200 |
| 10#7 | MEDIUM | fixed | 채널·역할 목록 핸들러 2개를 `registerGuildListRoute(path, kind)` 팩토리로 통합. 멤버 핸들러는 쿼리 검증이 있어 그대로 유지 | guild-data.ts:233~248 |
| 10#8 | LOW | fixed | 모듈 헤더 주석 11줄 3문단을 목적·재시도·계약 위치 3줄로 압축 (LLM 불신·재검증·규칙 상수 공유 사실 유지) | customCommandDraft.ts:1~4 |
| 10#9 | LOW | fixed | 길드 데이터 흐름 주석 6줄을 3줄로 압축 (우회 이유 1줄 + 채널 2개 + 503/502 규칙 유지) | guild-data.ts:230~232 |
| 10#10 | LOW | fixed | 임포트한 스키마를 같은 이름으로 한 번 더 대입하던 별칭 래퍼 2개 제거 | ai.ts:19,42 (래퍼 :17,:41 삭제) |
| 10#11 | LOW | fixed | social.ts의 `guildIdParams` 중복 정의를 제거하고 common.ts의 것을 import | social.ts:5 (중복 정의 :12 삭제) |
| 10#12 | LOW | fixed | pending 키 NX 선점 후 409 거절 블록 2곳을 `claimPendingSlot` 헬퍼로 통합 (충돌 코드·메시지는 인자) | guild-data.ts:44~53 / :171,205 |
| 10#13 | LOW | fixed | 브레이커 빈 상태 문구에서 조건이 뒷받침하지 못하는 "모든 프로바이더 정상" 단정 제거 | dashboard.ts:215 |
| 10#14 | LOW | fixed | 재생 오류 빈 상태 문구의 장식 이모지 제거 | dashboard.ts:193 |
| 10#15 | LOW | fixed | 지명된 대상만 단위 테스트 추가: 공통 오류 매핑 9건(sendError 3 상태코드 분기, replyBotRelayFailure 400/502/503, sendDomainError identifier/fallback), 소셜 프록시 4건(503 미설정, 502 연결 실패, 길드 ID 400, 구독 ID 400) | routes/common.test.ts / routes/social.test.ts |
| 18#1 | MEDIUM | deferred | `@@index([guildId])` 제거는 스키마 변경 + 새 마이그레이션 DROP이 필요해 보류. 스키마 구조 변경 금지 지시에 따름. 사유는 리스크 절 참고 | schema.prisma:87 (미변경) |
| 18#2 | MEDIUM | deferred | `@@index([playlistId])`도 같은 사유로 보류 | schema.prisma:214 (미변경) |
| 18#3 | LOW | fixed | 상단 prisma init 서식 주석과 Accelerate 홍보 링크 5행 삭제 | schema.prisma:1 (1~5행 삭제) |
| 18#4 | LOW | fixed | 필드군을 재서술만 하는 빈 라벨 주석 3곳 삭제 (`Statistics` 1, `Relations` 2) | schema.prisma:121,125,139 (라벨 삭제) |
| 18#5 | LOW | fixed | UserToken 필드 주석 3행 삭제. 암호화 사실은 모델 주석(AES-256-GCM)에 이미 있어 정보 손실 없음 | schema.prisma:148~150 (주석 삭제) |
| 18#6 | LOW | fixed | enum 생성이 없는 마이그레이션의 `-- CreateEnum (none)` 표시와 뒤 빈 줄 삭제 | migrations/20261001000000_add_chat_history/migration.sql:1 |
| 18#7 | LOW | fixed | 스키마 주석이 복붙된 마이그레이션 주석을 새 컬럼 용도 한 줄로 축약 (타입 동기화 계약 문장은 스키마에만 유지) | migrations/20261010000000_member_greeting/migration.sql:1 / migrations/20261015100000_custom_commands/migration.sql:1 |

## 검증

실행한 명령과 결과입니다.

- `yarn install` (worktree 루트): `Done with warnings in 9s 827ms`. peer dependency 경고(YN0002/YN00086)는 설치 전부터 있던 것.
- `yarn workspace @sirubot/data-api lint`: exit 127 `command not found: prettier` 실패 (이 환경의 yarn 스크립트 PATH 문제, 코드와 무관). 동일 스크립트를 turbo 경유로 실행: `yarn turbo lint --filter=@sirubot/data-api` → `All matched files use Prettier code style!`, `Tasks: 1 successful`. 동일 명령을 직접 실행 (cwd `apps/data-api`): `../../node_modules/.bin/prettier --check "src/**/*.ts"` → `All matched files use Prettier code style!`, exit 0.
- `yarn workspace @sirubot/data-api test`: 같은 원인으로 exit 127 `command not found: vitest`. turbo 경유로 실행: `yarn turbo test --filter=@sirubot/data-api` → `Test Files 24 passed (24)`, `Tests 190 passed (190)`, `Tasks: 4 successful`.
- 신규 테스트 개별 실행: `yarn vitest run --config vitest.config.ts routes/common.test routes/social.test` → `Test Files 3 passed (3)`, `Tests 24 passed (24)` (신규 data-api 13건 + 기존 notifier social 11건).
- `yarn typecheck` (root turbo): `Tasks: 14 successful, 14 total`.
- `yarn turbo typecheck --filter=@sirubot/data-api --filter=@sirubot/prisma`: `Tasks: 5 successful`.
- `yarn workspace @sirubot/prisma generate`: `Generated Prisma Client (v7.8.0) to ./dist in 324ms`, exit 0. 주석 수정 후 스키마 파싱 통과.
- `yarn lint` (root): `Tasks: 10 successful, 10 total`.
- `yarn test` (root): `Tasks: 14 successful, 14 total` (bot 48파일/521건, dashboard 37/247건, notifier 14/127건 포함).
- 패턴 점검: `grep -rn "──" apps/data-api/src/{routes,plugins,config}` 0건. `git diff`에서 삭제된 `// ──` 포함 라인 24건으로 finding 10#2의 24곳과 일치.
- `yarn prettier --write` 대상 13개 파일 전부 `unchanged` (내 수정이 이미 스타일 규칙 안에 있었음을 확인).

미수행 항목:

- DB 연동 검증(`prisma migrate status`, 마이그레이션 재실행)은 실행하지 않음.
- 레디스·봇 릴레이가 필요한 HTTP 라우트 통합 테스트(guild-data 503/409, 채널·역할 목록)는 실행하지 않음. 해당 경로는 타입체크와 코드 검토로만 확인함.
- 대시보드 HTML의 브라우저 렌더 확인은 실행하지 않음 (문자열 상수만 수정).

## 리스크 / 병합 주의

호출자에게 보이는 동작 변경:

- 10#1: 인사 카드 미리보기 400 본문이 `이미지 설정이 비어 있어요. useImage를 켜고 배경을 지정해 주세요.`로 바뀜 (대시보드 안내 문구 노출 변화).
- 10#13: 대시보드 브레이커 빈 상태가 `열린 브레이커 없음`으로 축약됨. 기존 `모든 프로바이더 정상` 단정이 사라짐.
- 10#14: 대시보드 재생 오류 빈 상태에서 `🎉`가 사라져 `재생 오류가 없어요`만 남음.

구조 통합으로 인한 변경 (응답 계약은 동일하게 유지했다고 판단한 것):

- 10#4/#5/#6/#7/#12: 상태코드, 에러 코드, 메시지 문자열은 그대로 두고 코드만 헬퍼로 옮김. 단 이 판단은 단위 테스트(400/502/503 계열)와 타입체크에 근거하며, guild-data의 503·409와 목록 합성 경로에는 라우트 통합 테스트가 없어 실행 검증은 미수행이다.
- 10#3: `stripCodeFences`가 customCommandDraft.ts의 export가 됨. 구현은 한 줄도 바꾸지 않아 동작 동일. `services/memoryTidy.ts`의 같은 함수 3번째 복제본은 범위 밖(다른 에이전트 소유)이라 그대로 남아 있음.
- 10#9/#8: 주석만 압축. 실행 코드 변경 없음.

Prisma 변경 관련:

- 18#3~#7: 주석만 수정했다. DDL, 필드, 어노테이션, 인덱스는 건드리지 않았다. `yarn workspace @sirubot/prisma generate`로 스키마 파싱은 확인했다.
- 18#6/#7: 이미 적용 이력이 있는 마이그레이션 파일 3개의 주석을 수정했다(DDL 본문 불변). DB 저장 이력과 대조하는 검증은 실행하지 않았다.
- **병합 주의 (중요): `packages/prisma/src/schema.prisma`는 메인 작업 트리에서 사용자가 미커밋 수정 중인 파일이다. 이번 커밋 `7aba664f`도 같은 파일(상단 5행 삭제, Track/User 라벨 3곳 삭제, UserToken 필드 주석 3행 삭제)을 수정했으므로 메인 병합·리베이스에서 충돌이 날 가능성이 높다. 충돌 시 위 주석 삭제분은 유지하고, 사용자의 구조 변경 라인은 살려야 한다. 충돌 해결 후 `yarn workspace @sirubot/prisma generate`로 다시 파싱 확인을 권장한다.**

DEFER 사유:

- 18#1/#2: 단일 인덱스 2건 제거는 `@@index` 삭제와 별도 마이그레이션의 `DROP INDEX`가 쌍으로 필요하다. 지시된 "스키마 구조 변경 금지, 주석만 수정" 범위를 넘어서고 DB 마이그레이션이 필요하므로 보류했다. 스키마의 해당 라인(`schema.prisma:87`, `:214`)은 그대로 남아 있다.
