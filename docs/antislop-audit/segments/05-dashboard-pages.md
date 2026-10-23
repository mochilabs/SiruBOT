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
