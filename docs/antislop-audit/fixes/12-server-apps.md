# FIX 리포트: 세그먼트 12/13/14 (서버 앱 3종)

FIXED: 26 / DEFERRED: 1 / N/A: 1

- 수정 브랜치: `fix/server-apps` (워크트리 `/home/sunshine/.local/share/opencode/worktree/e08104/fix-server-apps`)
- 커밋: `35ea0499` chore: shardmanager/storage/notifier antislop 감사 수정 (push 없음)
- 수정 범위: `apps/shardmanager/src/**`, `apps/storage/src/**`, `apps/notifier/src/**` 한정

## Finding별 처리 내역

| 세그먼트#번호 | 심각도 | 상태 | 변경 요약 | 파일:라인(수정 후) |
|---|---|---|---|---|
| 12#1 | HIGH | fixed | 한국어 주석 em dash 10곳을 콜론/마침표로 치환, 내용 보존 | shardmanager/src/server.ts:35,39,41, core/shardRegistry.ts:11,68,72,87, routes/ws/index.ts:37,103,123 |
| 12#2 | MEDIUM | fixed | 시그니처 재서술 JSDoc 12블록 삭제. claimShards 계약 문서와 getAllProcesses의 wsConnection 제외 설명은 유지 | core/shardRegistry.ts:67-74,187 |
| 12#3 | MEDIUM | fixed | 호출처 0건 재확인(grep) 후 `ShardRegistry.broadcast()`와 미사용 `WsMessage` import 제거 | core/shardRegistry.ts (234~243행 삭제) |
| 12#4 | LOW | fixed | 테스트 주석·내부 로그 문자열 em dash 6곳 치환 | core/shardRegistry.test.ts:126, routes/ws/index.test.ts:64,78,86,97, routes/ws/index.ts:40 |
| 12#5 | LOW | fixed | `validateEnv()` 재서술 주석 삭제 | index.ts:13 (삭제) |
| 12#6 | LOW | fixed | 빈 catch의 `// ignore`를 사유 한 줄로 교체 | core/shardRegistry.ts:246 |
| 12#7 | LOW | fixed | 교체 이력 서술 2줄 주석을 계약 1줄로 축약 | server.ts:35 |
| 12#8 | LOW | fixed | `GatewayResponse`의 `export` 한정자 제거(파일 내부 타입) | utils/gateway.ts:6 |
| 12#9 | LOW | fixed | 400/404 방어 분기 테스트 3건 추가 | routes/api/shards/[id].test.ts (신규) |
| 12#10 | LOW | fixed | `HEARTBEAT_TIMEOUT_MS`를 프로덕션에서 export하고 테스트가 임포트하도록 통합 | core/shardRegistry.ts:8, core/shardRegistry.test.ts:3 |
| 12#11 | LOW | fixed | `.d.ts` 상대 import에 `.ts` 확장자 추가, typecheck로 확인 | types/fastify.d.ts:2 |
| 13#1 | MEDIUM | fixed | `ObjectPathError` 400 캐치 4곳을 파일 내 `storeCall` 헬퍼로 통합. server.ts:17의 라우트 층 매핑 계약 유지 | routes/objects.ts:13-23,55,71,93,105 |
| 13#2 | LOW | fixed | 내부 주석 em dash 15곳 치환 | index.ts:8, server.ts:16, config/env.ts:9,21, plugins/auth.ts:5-6, routes/health.ts:3, routes/objects.ts:16,62, server.test.ts:8, services/objectStore.ts:23,29 등 |
| 13#3 | LOW | fixed | 기동 오류 메시지의 장식 이모지 제거 | config/env.ts:23 |
| 13#4 | LOW | fixed | 라우트 선언부 재서술 라벨 주석 3곳 삭제. 공개 조회 출처 정보(:62)는 유지 | routes/objects.ts:21,80,105 (삭제) |
| 13#5 | LOW | fixed | 경로 오류 문자열 8곳을 `INVALID_OBJECT_PATH_MESSAGE` 상수로 통합(문구 값 불변) | services/objectStore.ts:30, routes/objects.ts:3,20,89 |
| 13#6 | LOW | fixed | env fail-closed 경로 테스트 4건 추가(키 부재 exit, 단독 설정 2종, 우선순위) | config/env.test.ts (신규) |
| 13#7 | LOW | fixed | `x-request-id` 응답 헤더 검증 1건 추가 | server.test.ts:42-46 |
| 13#8 | LOW | deferred | PUT 핸들러 방어 분기(400 비버퍼, 413) 도달성 미확증. 리포트의 제안대로 도달성 확정 테스트가 선행돼야 제거/분기 결정 가능 | routes/objects.ts:44-45 |
| 14#1 | HIGH | fixed | 웹훅 표시 기본값의 em dash 치환: `시루 소셜 알림: ${sourceName}`. 80자 절단 유지 | routes/social.ts:143 |
| 14#2 | MEDIUM | fixed | 모듈 로거·에러 문자열·주석의 em dash 164줄 일괄 치환(라벨부는 콜론, 문장 경계는 마침표). 내용 보존 | services/db.ts:12,21, services/chzzkPoller.ts:78, services/youtubeWebSub.ts:98, index.ts:42 외 27개 파일 |
| 14#3 | MEDIUM | fixed | 박스 문자(`──`) 구분선 제거, 괄호 설명 한 줄 주석으로 유지 | services/chzzkApi.ts:81,118 |
| 14#4 | MEDIUM | fixed | 사용처 0건 grep 재확인 후 `getDb` export 함수 삭제(모듈 전역 `db`와 connect/disconnect 유지) | services/db.ts:34 (삭제) |
| 14#5 | LOW | fixed | 유튜브 스케줄러 주석의 `①`/`②` 번호 표식만 제거, 문장 유지 | services/youtubeScheduler.ts:78,102 |
| 14#6 | LOW | fixed | 미사용 export 6건의 `export` 한정자 제거(임포트 0건 grep 재확인) | services/youtubeWebSub.ts:11,20, services/dispatcher.ts:23,34,44, services/chzzkPoller.ts:29 |
| 14#7 | LOW | n/a | Redis JSON 로드/저장 3회 중복: 리포트가 "지금은 유지해도 된다"고 명시(검증부 통합 시 흐려짐). 지휘자 지시의 "통합 비추천 사유 존중"에 따라 수정하지 않음 | services/chzzkPoller.ts:140, services/twitchScheduler.ts:89, services/youtubeScheduler.ts:124 |
| 14#8 | LOW | fixed | notifier env fail-closed 키 검증 테스트 4건 추가 | config/env.test.ts (신규) |
| 14#9 | LOW | fixed | 기동 실패 안내의 `❌` 이모지 제거 | config/env.ts:41 |

## 검증

워크트리에서 실제로 실행한 명령과 결과입니다.

- `yarn install` : 성공 (Done with warnings in 9s 829ms, peer dependency 경고만)
- `yarn generate` : 성공 (1 successful, Prisma client)
- `yarn workspace @sirubot/shardmanager lint` (storage/notifier 동일) : **실패**. 이 환경에서 `yarn workspace <app> lint` 직접 호출은 `command not found: prettier` 출력. turbo 경유로 대체 실행
- `yarn lint --filter @sirubot/shardmanager --filter @sirubot/storage --filter @sirubot/notifier` : 성공 3/3. 3앱 모두 "All matched files use Prettier code style"
- `yarn test --filter @sirubot/shardmanager --filter @sirubot/storage --filter @sirubot/notifier --force` : 성공 7/7. shardmanager 3파일 27테스트 통과, storage 8파일 31테스트 통과, notifier 15파일 131테스트 통과
- `yarn typecheck --filter @sirubot/shardmanager --filter @sirubot/storage --filter @sirubot/notifier` : 성공 7/7 (3앱 typecheck cache miss로 실제 실행 후 통과)
- `grep -rn "—" apps/{shardmanager,storage,notifier}/src` : 0건
- `grep -rn "❌" apps/{storage,notifier}/src` : 0건

## 리스크/병합 주의

- notifier 웹훅 기본 이름이 `시루 소셜 알림: {소스명}`으로 바뀝니다. 기존에 생성된 웹훅은 Discord 쪽에 이름이 이미 저장되므로 그대로 유지됩니다. 변경은 이후 커스텀 이름 없이 새로 만드는 구독에만 적용됩니다.
- shardmanager `broadcast()` 제거: 호출처 0건을 재확인했지만, 향후 매니저에서 봇으로 내려보내는 하향 명령 기능을 붙이면 다시 구현해야 합니다.
- storage 경로 오류 응답은 문자열 상수 통합으로 문구 값이 그대로지만, 응답을 만드는 경로가 `storeCall` 헬퍼 1곳으로 모입니다. `server.test.ts`의 400 계약 테스트는 그대로 통과합니다.
- 3앱의 운영자 로그 문자열에서 em dash 구분자가 콜론/마침표로 바뀌어, 과거 로그를 그 문자로 검색하는 습관이 있으면 검색어를 바꿔야 합니다(내부 로그 한정).
- shardmanager `fastify.d.ts`의 `.ts` 확장자 추가와 `HEARTBEAT_TIMEOUT_MS` export는 typecheck로 확인했습니다. 빌드 산출물에는 영향 없습니다(타입 전용).
