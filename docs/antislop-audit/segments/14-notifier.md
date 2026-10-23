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
