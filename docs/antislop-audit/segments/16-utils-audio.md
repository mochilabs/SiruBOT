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
