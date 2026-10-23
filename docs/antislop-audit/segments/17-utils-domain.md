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
