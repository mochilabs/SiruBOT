# 디자인 토큰 건강검진 리포트

- 기준: `beta` 브랜치 (`origin/beta` 동기화 상태), 2026-10-13
- 대상: `apps/dashboard` (토큰 단일 소스 `apps/dashboard/src/app/globals.css`)
- 방법: 0단계 인벤토리(오케스트레이터) → 5개 검증 에이전트 병렬 조사(grep/read 증거 기반) → 취합·중복 제거
- 산출물: `audit/inventory.json` (토큰 원본부) + `audit/findings-1..5.json` (원본 보고) + 본 문서
- **코드 수정 없음** — 본 audit는 읽기 전용

---

## 1. 요약

| 항목 | 수치 |
| --- | --- |
| 정의된 토큰 | **84개** + `@utility` 10개 = 94개 정의 (`globals.css`, + `tailwind.config.ts`의 죽은 fontFamily 블록 1) |
| 에이전트 원본 보고 | 106건 |
| **고유 이슈 위치(파일:라인)** | **99건** (복수 유형 중복 6건 병합, 오케스트레이터 검증 추가 1건: `panel`) |
| 심각도 | high 14 / mid 26 / low 59 |

| 유형 | 건수 | 고유 위치 기준 |
| --- | --- | --- |
| 1. 의도 불일치 (intent-mismatch) | 31 | |
| 2. 용도 중복·불일치 (usage-inconsistency) | 24 (+2개 위치는 유형1과 공유) | |
| 3. 중복 토큰 (duplicate-token) | 13 (1개 위치는 유형4와 공유) | |
| 4. 미사용·고아 (unused-token) | 14 | |
| 5. 하드코딩 (hardcoded-value) | 18 (+3개 위치는 유형1과 공유) | |

양성 소식: **className/style 내 hex·rgb 직접 하드코딩 0건**, Tailwind 팔레트 직접 사용 0건, 숫자형 duration 0건 — 색상 토큰 준수율은 매우 높음. 문제는 색상 외축(반경·경계·라벨 톤)과 **서피스 이름 3중 중복**, **고아 정의 14건**에 집중돼 있음.

---

## 2. 심각도 상위 10 (파일:라인 — 현재 → 권장 — 이유)

| # | 위치 | 현재 | 권장 | 이유 |
| --- | --- | --- | --- | --- |
| 1 | `src/components/track.tsx:214,224` | `text-secondary` (rank-1 왕관) | 신규 랭크 색 토큰 제안(§5) | 서피스색(#fff0f0)을 텍스트로 사용 — `bg-surface-1` 위에서 **1위 왕관이 라이트에서 사실상 불가시**. rank-2는 discord 전용 토큰 재사용이라 색 순서까지 역전 |
| 2 | `src/components/servers/guild-card.tsx:58,68` | `bg-success/10 text-success hover:bg-success hover:text-foreground` | `bg-primary/10 text-primary-text hover:bg-primary-control hover:text-primary-control-text` | 상태 전용 success를 일반 액션 버튼에 상시 사용 + solid hover 위 텍스트가 `-foreground` 쌍이 아니라 **WCAG 대비 불합격** (유형1·2 공통, §6-1 충돌 있음) |
| 3 | `src/components/playlists/playlist-detail.tsx:150` | `bg-muted/30 border-border/40 font-medium uppercase tracking-wider` | DataTable 표준: `text-xs font-black text-muted-foreground` + `border-border-subtle` | 곡 목록 테이블 헤더가 공용 DataTable 헤더 표준에서 전면 이탈 — 시각 톤 자체가 다름 |
| 4 | `src/components/track.tsx:35` (+`profile-view.tsx:45`) | `text-primary/20` | `text-primary-text` (+ 8px 크기는 토큰화 후보) | DESIGN.md 명시 금지 "text-primary를 텍스트에 쓰지 말 것" 위반 (유형1·5 공통) |
| 5 | `globals.css:286` (`@utility text-title-gradient`) | 정의만 존재 | 삭제 | 주석상 '브랜딩/헤로 6곳 소비' → **grep 소비자 0** 확인. 주석이 명시한 삭제 조건 이미 충족 |
| 6 | `globals.css:308,327` (`animate-shimmer-sweep` + `@keyframes shimmer-sweep`) | 정의만 존재 | 삭제 | 유틸리티·키프레임 사슬 전체 참조 0 — 완전 고아 |
| 7 | `tailwind.config.ts:11-13` (`fontFamily.pretendard`) | 죽은 설정 | 블록 삭제(파일 자체 재검토) | `font-pretendard` 클래스 소비 0 + 어떤 CSS에도 `@config` 지시문이 없어 **Tailwind v4가 이 config를 로드하지 않음** |
| 8 | `globals.css:54` (--muted) vs `L170` (--surface-2) | 동일 값 2이름 공존 | 값 소스 `--surface-2`로 단일화, 슬롯 별칭화 | 라이트(#fff0f0)·다크(#3a2c30) 모두 동일한데 **bg-muted 24파일 vs bg-surface-2 27파일**로 대규모 분산 |
| 9 | `globals.css:33` (--card) vs `L169` (--surface-1) | 동일 값 2이름 공존 | 정본 결정 후 별칭화 (§6-4) | 양쪽 테마 #ffffff/#2b2023 동일, Card ~30곳 vs bg-surface-1 19파일 — 정본 방향 불명 |
| 10 | `globals.css:35` (--popover) | 메뉴/팝오버 슬롯 | 역할 정합화 시 --surface-3 검토 (§6-4) | 개념상 플로팅 오버레이(--surface-3)인데 값은 surface-1과 동일 — 역할–값 불일치 상태로 9파일 확산 |

---

## 3. 유형별 상세

### 3-1. 의도 불일치 (31위치) — [원본: findings-1.json]

| 심각도 | 위치 | 현재 → 권장 | 내용 |
| --- | --- | --- | --- |
| high | track.tsx:35, profile-view.tsx:45 | `text-primary/20` → `text-primary-text` | 텍스트 금지 토큰(-primary는 밝은 서피스색)을 텍스트에 사용 |
| high | track.tsx:214, 224 | `text-secondary` → 신규 랭크 토큰 | 서피스색 텍스트 역전, 라이트 불가시 |
| mid | track.tsx:214, 224 | `text-discord-btn-hover/90` → 신규 랭크 토큰 | Discord 프리뷰 전용 토큰을 일반 랭킹 UI에 사용 |
| high | guild-card.tsx:58, 68 | success 계열 → 브랜드 관례 또는 `hover:text-success-foreground` | 상태색의 비상태 액션 사용 + hover 대비 위반 |
| mid | search-input.tsx:67 | `focus-visible:ring-primary/20` → `ring-ring` | 포커스 링이 연핑크 20%로 사실상 불가시(+ twMerge 미병합으로 `shadow-control-boundary`·`shadow-sm` 공존 — §6-5) |
| low | badge.tsx:50, badge.tsx:39, status-dot.tsx:4, avatar.tsx:32 | `bg-primary-text` / `bg-muted-foreground(/40)` → `--dot-neutral` 신규 | 텍스트 전용 토큰을 상태 점 채움으로 역전 |
| low | avatar.tsx:67, guild-card.tsx:22, servers/page.tsx:56 | `ring-primary/10~20` → 장식 링 관례 토큰화(§5-5) | 포커스 전용 ring 축의 장식 사용 |
| low | navbar.tsx:167 | `bg-foreground/5` → `bg-muted` | -foreground 토큰의 배경 역전 (kbd 칩) |
| low | button.tsx:21 | `hover:bg-foreground/5` → (관례 확정) | ghost hover의 -foreground 틴트 |
| low | button.tsx:20 | `hover:bg-surface-3` | 플로팅 오버레이 전용 토큰을 정적 hover 단계로 — **관례가 이미 9+파일 확산** (§6-2) |
| low | role-select.tsx:102,103, loading.tsx:34 | `border-primary-control` → ring/border 계열 or after 의사요소 | 채움 전용 토큰의 border 포지션 사용 |
| low | empty-state.tsx:28, error-panel.tsx:24, invite/page.tsx:46 | `rounded-menu` → `rounded-control` | 메뉴 전용 반경을 정적 칩에 사용 |
| low | web-player-section.tsx:89,96, player-client.tsx:79,86 | `rounded-control`→`rounded-card`, `bg-surface-3`→`bg-surface-1` | 정적 트랙 행/플레이스홀더의 역할 반경·서피스 역전 |
| low | error/page.tsx:31 | `text-destructive/5` → `text-foreground/5` | 상태색의 순수 장식 워터마크 사용 |
| low | playlist-detail.tsx:77, playlist-sidebar.tsx:128 | `fill-primary` → brand/control 계열 검토 | 서피스색을 SVG fill로 우회 사용 |
| low | avatar-crop-modal.tsx:52 | `rounded-control` → `rounded-card` | 대형 크롭 뷰포트에 컨트롤 반경 |

백지 확인(위반 없음): `text-brand`, border-{muted,secondary,accent,card}, `text-border-strong`, `--switch-thumb` 외부 사용, `var(--primary-rgb)` 소비, discord 토큰의 기타 외부 사용.

### 3-2. 용도 중복·불일치 (24위치, 역할별 그룹) — [findings-2.json]

| 역할 그룹 | 지배 패턴(근거) | 이탈 위치 → 권장 | 심각도 |
| --- | --- | --- | --- |
| 테이블 헤더 | DataTable: `font-black` + `border-border-subtle` | playlist-detail.tsx:150 → 표준 | high |
| 행 구분선·hover | `border-border-subtle`, `hover:bg-surface-2/50` | playlist-detail.tsx:168(`/10`,`muted/10`), permission-list.tsx:140(`divide-border/20`), permission-list.tsx:121(`bg-card/50`,`/40`) → 원값 | mid ×3 |
| 설정 인셋 박스 | `rounded-card border border-border-subtle bg-surface-2` | mixer-settings.tsx:56,67(`rounded-xl bg-muted/10`) → 표준 | mid |
| 카드 서피스 표기 | Card 기본 `bg-card` (~30곳) | stat-card.tsx:45, data-table.tsx:101의 `bg-surface-1` 오버라이드 제거 | low ×2 |
| 입력 경계 | `border-0 bg-input shadow-control-boundary` (Input·Textarea·Switch·tag-input 4종) | select.tsx:44, searchable-select.tsx:134 (경계 누락) → `shadow-control-boundary` 추가 · role-select.tsx:101 (무력한 가시 border) → 보더리스 전환 | mid ×3 |
| 드롭다운 검색 인풋 | Input 계열 필(bg-input …) | role-select.tsx:183 (언더라인형 유일) → 공용 Input | mid |
| 팝업 서피스 | `border-0 bg-popover shadow-2xl` (4개 컴포넌트) | role-select.tsx:166 (가시 border 유일) → border 제거 | low |
| 메뉴 항목 hover | `bg-accent`+`text-accent-foreground` | role-select.tsx:199(`accent/50`), command.tsx:159(`bg-muted`, §6-6), navbar.tsx:227(수기 구현 전체 이탈) → 표준 | mid ×3 |
| 헤더 구분선 | `h-px bg-border` (ui/select·dropdown·command) | navbar.tsx:150/171/232 (`/40`·`/70`·`/50` 세 종류) → `bg-border` 원값 | mid |
| 패널 검색 인풋 | `bg-input` 계열 | playlist-sidebar.tsx:77 (`bg-muted/40~60` 오버라이드) → `bg-input/50` | low |
| ghost/sidebar hover | ghost `bg-foreground/5` / 사이드바 `bg-accent/10` | playlist-sidebar.tsx:155 (`bg-muted/30`) → 관례 선택 | low |
| 라벨 굵기 | `font-medium` (SectionLabel·DropdownMenuLabel) | searchable-select.tsx:168(`font-semibold`), select.tsx:105(굵기 없음), footer.tsx:64(`font-black`) → `font-medium` | low ×3 |
| 섹션 제목 굵기 | `font-bold` 5곳 | data-api-section.tsx:81 (`font-semibold`) → `font-bold` | low |
| 인페이지 탭 | 공용 Tabs (line variant) | player-client.tsx:209 (pill idiom 수기 구현) → Tabs | mid |
| 아이콘 토글 off-state | `bg-secondary shadow-control-boundary` | track.tsx:186 (`border-border bg-surface-2`) → 표준 + hover도 관례 합류 | mid |

클린 그룹: muted 텍스트(원값 232곳, 변형 0), 상태 칩(Tailwind 팔레트 직접 사용 0).

### 3-3. 중복 토큰 (13건, 전부 globals.css 정의 라인) — [findings-3.json]

| 항목 | 관계 | 소비자 분산 | 판정 |
| --- | --- | --- | --- |
| --muted / --secondary / --surface-2 | 양쪽 테마 동일 값 #fff0f0/#3a2c30 | 24파일 / 6파일 / 27파일 | **high** — 값 소스 surface-2 단일화 제안 |
| --card / --popover / --surface-1 | 양쪽 테마 동일 값 #ffffff/#2b2023 | 7 / 9 / 19파일 | **high** — 정본 방향 결정 필요(§6-4) |
| --shadow-xs = --shadow-sm | 둘 다 `var(--elev-1)` 영구 고정 | 2파일 vs 9파일 | mid — shadow-sm 통합 |
| 반경 1rem 3중 리터럴 (--radius/--r-card/--r-dialog) + rounded-lg 동일 해석 | 값 복사(별칭 아님) | rounded-lg 8파일 / card 26파일 / dialog 3파일 | mid — rounded-lg 소비처 역할 토큰 이전 |
| --border = --input | 양쪽 테마 동일(의도된 슬롯 분리) | 14 vs 11파일 | low — 별칭화 수준이면 충분 |
| --accent(다크) = --border = --input (다크 #4d3b40 수렴) | 우연한 수렴 | bg-accent 8파일 | low — 조치 불요 |
| --primary-foreground = --accent-foreground(라이트 #4f1c2a), 다크 --accent-foreground = --primary (#ffdada) | 테마별 수렴 | 정본 명시만 | low |
| foreground 슬롯 4종 동일(--foreground/--card-foreground/--popover-foreground/--secondary-foreground) | shadcn 슬롯 관례 | text-foreground 67파일 압도 | low |
| 상태 -foreground 라이트 4종 전부 #ffffff | 소비자 0과 결합 | 0 | low (유형4와 공유: L246) |
| alias 체인: `--primary-text → var(--accent-foreground)` | 네이밍 정본(primary-text 37파일)과 정의 정본(accent-foreground) 역전 | — | low — 방향만 명시 |
| alias 체인 + 중복: `--control-boundary`의 .dark 재정의가 :root와 바이트 동일(L203=L219, L204=L220) | 불필요 중복 | shadow-control-boundary 7파일 | low — .dark 블록 삭제 가능 |

### 3-4. 미사용·고아 (14건) — [findings-4.json + 오케스트레이터 1건]

| 위치 | 토큰 | 근거 | 심각도 |
| --- | --- | --- | --- |
| globals.css:286 | `text-title-gradient` | src 참조 0 (주석이 말한 헤로 6곳 부재) | high |
| globals.css:308+327 | `animate-shimmer-sweep` + `@keyframes shimmer-sweep` | 사슬 전체 참조 0 | high |
| tailwind.config.ts:12 | `font-pretendard` fontFamily | 클래스 0 + `@config` 없어 v4 미로드(죽은 설정) | high |
| **globals.css:279** | **`panel`** | **참조 0 (오케스트레이터 grep 확인 — design-tokens skill의 '소비자 8곳' 기록은 구식)** | mid |
| globals.css:233+209 | `--shadow-xl` (=--elev-4) | 실소비자 0 (design 갤러리 라벨 표기뿐) | mid / elev-4는 low |
| globals.css:244,246,248,250 | `--destructive/success/warning/info-foreground` | 유틸·raw 참조 모두 0 (§6-7) | mid ×4 |
| globals.css:121 | `--color-brand` 매핑 | `bg-brand` 등 유틸 0 (변수 --brand는 내부 소스로 생존, §6-3) | low |
| globals.css:445 | `--ease-standard` | `ease-standard` 클래스 0 | low |
| globals.css:51 | `--primary-rgb` | raw 참조 0 (스크롤바는 var(--primary) 직접 사용) | low |

`@keyframes cursor-blink`는 고아가 아님(streaming-type-text.tsx:79 실사용).

### 3-5. 하드코딩 (18건) — [findings-5.json]

| 위치 | 값 | 권장 | 심각도 |
| --- | --- | --- | --- |
| features-section.tsx:571, 575 | `gap-[2px]`, `w-[2px]` | `gap-0.5`, `w-0.5` (**1:1 일치, 기본 스케일 규칙 위반**) | mid ×2 |
| tabs.tsx:21 | `p-[3px]` | 스케일에 3px 없음(p-0.5 근사) | low |
| toast.tsx:90 | `ease-[cubic-bezier(0.22,1,0.36,1)]` | `ease-standard` (근사, 파라미터 상이) | low |
| button.tsx:38,40,41 | `rounded-[min(var(--radius-md),10px/12px)]` | `rounded-control` (xs 계열은 해상값 10px 1:1) | low ×3 |
| input-group.tsx:26,73,76 | `rounded-[calc(var(--radius)-3px/5px)]` | 토큰 파생 구조라 경계 — 리터럴 오프셋만 상수 | low ×3 |
| button.tsx:11, input.tsx:14, textarea.tsx:12, tag-input.tsx:66, slider.tsx:74 | `transition-[color,background-color,box-shadow]` 등 | 명명 유틸 1:1 없음 → **신규 유틸리티 후보**(§5-1) | low ×5 |
| player-live-tab.tsx:71 | `transition-[width]` | 명명 유틸 없음 | low |
| avatar-crop-modal.tsx:289 | `shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]` | 기능성 마스크 — elevation 토큰과 무관, 토큰화 가치 낮음 | low |
| playlist-detail.tsx:254 | `text-[13px]` | 근사 `text-xs` (1px 차이) | low |

hex/rgb 직접 색상, Tailwind 팔레트 직접 사용, 숫자형 duration: **0건** (member-greeting canvas 프리셋·themeColor 메타·Discord 브랜드색은 도메인 예외로 제외).

---

## 4. 토큰별 영향 범위 (변경 시 영향 파일 수)

2026-10-13 beta, `apps/dashboard/src` grep 기준 (design/page.tsx 쇼케이스 포함, refs=매치 행 수):

| 토큰(유틸) | 파일 | refs | 토큰(유틸) | 파일 | refs |
| --- | --- | --- | --- | --- | --- |
| text-muted-foreground | 71 | 276 | shadow-2xl | 11 | 14 |
| *-foreground(기본) | 67 | 172 | bg-input 계열 | 11 | 18 |
| text-primary-text | 37 | 88 | warning | 10 | 25 |
| rounded-control | 34 | 62 | success | 9 | 20 |
| duration-fast | 33 | 54 | shadow-sm | 9 | 12 |
| primary-control 계열 | 28 | 43 | bg-popover | 9 | 13 |
| bg-surface-2 | 27 | 47 | rounded-lg | 8 | 10 |
| rounded-card | 26 | 54 | duration-base | 8 | 15 |
| primary(서피스) | 26 | 53 | bg-accent | 8 | 13 |
| ring-ring | 24 | 30 | shadow-control-boundary | 7 | 8 |
| bg-muted | 24 | 67 | bg-card | 7 | 15 |
| destructive | 22 | 48 | border-border-subtle | 7 | 11 |
| bg-surface-1 | 19 | 34 | bg-secondary | 6 | 12 |
| text-2xs | 14 | 51 | info | 4 | 10 |
| border-border | 14 | 49 | border-border-strong | 4 | 5 |
| bg-surface-3 | 12 | 17 | rounded-dialog | 3 | 5 |
| rounded-menu | 12 | 22 | duration-slow | 3 | 3 |

영향 0~2: `bg-brand` 0, `panel` 0, `rounded-2xl` 0, `shadow-xl` 0(갤러리만), `ease-standard` 0, `text-*-foreground(상태)` 0, `shadow-xs` 2파일, `shadow-md/lg` 2파일.

→ 핵심 서피스 3쌍(--muted/--surface-2, --card/--surface-1)을 건드리면 **24~27파일 단위 파급**. 고아 삭제 대상(§3-4)은 파급 0이라 안전.

---

## 5. 신규 토큰 제안

| 이름 | 값(제안) | 용도 | 근거 |
| --- | --- | --- | --- |
| `@utility transition-control` | `transition-property: color, background-color, box-shadow;` | 컨트롤 공통 트랜지션 | button/input/textarea/tag-input 4곳 동일 임의값 (slider 변형은 별도 검토) |
| `--text-3xs` (=0.5rem) | 8px / lh 0.75rem | 썸네일 워터마크 | track.tsx:35, profile-view.tsx:45의 `text-[8px]` 2곳 |
| `--rank-1 / --rank-2 / --rank-3` | 예: `#f0b232` / `#b9bbbe` / `#cd7f32` (디자인 검토 필요) | 랭킹 크라운 금/은/동 | track.tsx:214,224의 token 역전 해소 |
| `--dot-neutral` | `var(--muted-foreground)` 별칭 수준 | 중립 상태 점/배지 dot 채움 | badge×2, status-dot, avatar offline 4곳의 텍스트 토큰 역전 해소 |
| 장식 링 관례 (예: `--ring-halo` 또는 문서화) | `ring-primary/10` 동등 | 아바타 헤일로 ring (비포커스) | avatar.tsx:67, guild-card.tsx:22, servers/page.tsx:56 — 관례를 인정하고 토큰/문서로 승격할지 결정 |
| (관찰) `--text-mini` | 13px | 테이블 서브텍스트 | playlist-detail.tsx:254 단일 사례 — 빈번해지면 도입 |

불필요 제안(기각): `--text-display`(error 페이지 단일 장식), elevation 외 마스크 섀도 토큰, toast 전용 이징(ease-standard 수렴 권장).

---

## 6. 검토 필요 (에이전트 간 충돌·판단 보류)

1. **guild-card.tsx:58/68 컨트롤러 버튼 방향 충돌** — 에이전트1·5 규칙: 상태색은 상태 전용 → 브랜드 패밀리로 교체 / 에이전트2 권장: success 유지 + `hover:text-success-foreground`로 대비만 수정. DESIGN 명명 규칙상 교체가 정합하나 "음악=초록"의 디자인 의도 가능성 — 결정 필요.
2. **`hover:bg-surface-3` 관례(9+ 파일)** vs `--surface-3` 정의(플로팅 오버레이 전용) — 관례가 이미 표준처럼 확산. 정의문을 완화(=문서 수정)할지, 소비처를 `hover:bg-accent` 계열로 옮길지.
3. **`--color-brand` 유틸 소비자 0** vs DESIGN.md "액션은 bg-brand" 문구 — 실코드는 bg-primary-control로 수렴. 문서 갱신(또는 유틸 삭제)이 현실적.
4. **--popover 정본 방향** — 값은 surface-1 동일, 역할은 surface-3(플로팅)에 정합. 어느 쪽으로 통합할지(또는 popover 유지) 디자인 결정.
5. **tailwind-merge 미병합** — `cn()`이 `shadow-control-boundary`, `rounded-control` 등 커스텀 토큰을 같은 그룹으로 병합하지 못함(에이전트2 실행 검증). 오버라이드 시 box-shadow/border-radius 잔존 충돌 가능(search-input.tsx:67 실례). `twMerge` extend 설정 여부 검토.
6. **command.tsx:159 `data-selected:bg-muted`** — 메뉴 하이라이트 표준 bg-accent에서의 의도적 차별화인지 확인.
7. **상태 `*-foreground` 4종 삭제 vs 보류** — 현재 소비자 0이나 'solid 배지 전환' 마이그레이션(DESIGN.md 예고) 시 필요. 마이그레이션 계획 확정까지 보류 권장.
8. **문서 동기화** — design-tokens skill/DESIGN.md가 `panel` 8곳·`rounded-2xl` 11건·`text-title-gradient` 6곳을 기술하나 beta 기준 **모두 0**. globals.css 주석(LEGACY 문구)도 함께 갱신 필요.

---

## 7. 수정 우선순위 제안 (묶음 단위)

> 실제 수정은 수행하지 않음. 각 묶음은 독립 PR 가능 단위. 토큰 값 변경 후 `python3 scripts/wcag-contrast-audit.py` — `Unexpected failures: 0` 확인 + `yarn lint && yarn typecheck`.

- **P1 [시각 깨짐·접근성 즉시 수정]** (8곳, high)
  guild-card.tsx:58,68 · track.tsx:214,224(랭크) · track.tsx:35 · profile-view.tsx:45 · playlist-detail.tsx:150,168 · search-input.tsx:67 — 모두 파급이 파일 국한이라 회귀 위험 낮음. §6-1 결정만 선행.
- **P2 [입력 경계·메뉴 일관성]** (7곳, mid)
  role-select.tsx(101,166,183,199) + select.tsx:44 + searchable-select.tsx:134에 `shadow-control-boundary`·보더리스·`bg-accent` hover 통일 + track.tsx:186 토글 표준화. §6-5(twMerge) 판단과 함께 진행 권장.
- **P3 [고아 삭제, 파급 0]** (14건)
  globals.css: text-title-gradient / animate-shimmer-sweep+keyframes / panel / --primary-rgb / --ease-standard·--color-brand 매핑 / .dark의 --control-boundary 중복 블록(L219-220) + tailwind.config.ts fontFamily 블록. 상태 -foreground 4종·--shadow-xl/elev-4는 §6-7·갤러리 정리 후 순차 삭제.
- **P4 [서피스 정본 통합 — 결정 선행]** (중복 그룹 3개)
  --muted/--surface-2(+--secondary), --card/--popover/--surface-1, shadow-xs→sm, rounded-lg 소비처 8파일 → 역할 토큰. §6-4 방향 결정 후 일괄 rename(각 그룹 20+파일 파급 → 단일 PR에서 기계적 치환).
- **P5 [잔여 톤 통일]** (12곳, low 중심)
  navbar 구분선 opacity 3종 → `bg-border`, permission-list divide·/40, mixer-settings 인셋 표준화, 메뉴 라벨 굵기 3종 → font-medium, footer/data-api-section 굵기, playlist-sidebar hover·인풋, stat-card/data-table 오버라이드 제거.
- **P6 [신규 토큰 도입]** (§5)
  `transition-control` 유틸 + `--rank-*` + `--text-3xs` + `--dot-neutral` 정의 후 P1/P5 소비처에 적용.
