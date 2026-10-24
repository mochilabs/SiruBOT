# DESIGN.current.md — SiruBOT 대시보드 현행 디자인 시스템 감사 (Phase 1 기준선)

> 감사 기준: 워크트리 `beta` @ `bfff575b` (2026-10-24). 본 문서는 **현행 구현의 사실 기록**이며 재디자인 제안이 아니다.
> 근거 표기: `[SRC]` = 소스 코드, `[BR]` = 브라우저 렌더링 실측, `[SRC+BR]` = 양쪽 교차 확인.
> 경로는 `apps/dashboard/` 기준 상대경로. 문서(`apps/dashboard/DESIGN.md`, `.pi/skills/dashboard-ui/SKILL.md`)와 코드가 다를 때는 코드가 사실이다 — 불일치는 §12에 기록.

---

## 1. 프로젝트 개요

- **목적**: Discord 음악·AI·서버 관리 봇 "시루봇"의 웹 대시보드. 홈(랜딩) + 인증형 관리 콘솔(서버/플레이리스트/플레이어/프로필) + 운영 페이지(상태/차트/라이선스)로 구성. `[SRC]`
- **프론트엔드 아키텍처**: Next.js 16.4.3 App Router(라우트 그룹 없음), React 19.3.1, `output: "standalone"`. `transpilePackages: ["@sirubot/prisma"]`. 인증은 `next-auth` 5 beta(Discord OAuth, `src/lib/auth.ts`)이고 `src/middleware.ts`는 **없음** — 서버 컴포넌트 `auth()` + 클라이언트 `useAuthedSWR`/`useGuildResource`의 401 리다이렉트가 게이트. `[SRC]`
- **스타일 시스템**: Tailwind CSS v4(`@tailwindcss/postcss` 4.3.3) + `@theme inline` 토큰(`src/app/globals.css`, 603줄 9섹션) + cva 기반 shadcn 계열 컴포넌트(`components.json` `style: "base-nova"`, 런타임은 `@base-ui/react`). 다크/라이트는 next-themes `attribute="class"`, **다크 기본**(`defaultTheme="dark"`, `enableSystem={false}`, `src/components/Providers.tsx`). `[SRC]`
- **관찰된 시각 방향**: "시루떡" 웜 핑크·마룬 아이덴티티(베이스 `#ffdada`, 다크 배경 `#1f1618`). 보더리스 컨트롤(inset shadow 경계), 넓은 카드 라운드, 낮은 텍스트 대비의 muted 톤, framer-motion 기반 과감한 등장 애니메이션. `[SRC+BR]`

## 2. 디자인 시스템 아키텍처

| 항목 | 위치 | 내용 |
|---|---|---|
| 토큰 정의(단일 소스) | `src/app/globals.css` | 9개 번호 섹션: ①imports/`@custom-variant dark` ②시맨틱 변수 `:root`/`.dark` ③`@theme inline` 컬러 매핑 ④타이포 ⑤radius·surface ⑥border·shadow·z ⑦status ⑧utility·키프레임 ⑨motion·reduced-motion |
| shadcn 보존 스타일 | `src/styles/shadcn-tailwind.css` | scroll-fade mask, `tw-shimmer` 등 레거시 보존 시트 |
| 테마 스위치 | `src/components/Providers.tsx`, `navbar.tsx` | next-themes 클래스 스위치, View Transitions API로 토글 |
| 컴포넌트 소스 | `src/components/{ui,primitives,overlay,discord,data,layout,feedback,home,player,playlists,servers,member-greeting}/**` | `ui/` = shadcn 계열 공용 프리미티브, `primitives/` = field·empty-state·section-label·status-dot 등 |
| cn 유틸 | `src/lib/utils.ts` | `cn()` + tailwind-merge 커스텀 그룹(`transition-control` 등 등록) |
| 쇼케이스 | `src/app/design/page.tsx` + `src/app/design/_sections/*` | 토큰·컴포넌트 갤러리(`/design`, 공개 라우트) |
| 토큰→컴포넌트 관계 | — | 유틸리티(`bg-surface-1`, `rounded-control` 등)가 전부 `@theme inline`을 통해 런타임 CSS 변수 참조 → `.dark` 재정의만으로 테마 전환. 컴포넌트 마크업의 `dark:` 분기는 원칙적으로 0건(원시 status 색 등 예외만) |

토큰 소비 규칙(`globals.css` 주석 + `DESIGN.md` 계약): `--brand`는 소스 전용, 강조 텍스트는 `text-primary-text`, 솔리드 CTA는 `bg-primary-control` + `text-primary-control-text`, 중립 hover는 `bg-secondary → hover:bg-surface-3`. `[SRC]`

## 3. 컬러 시스템

정의: `src/app/globals.css` (라이트 `:root` :23-77 / 다크 `.dark` :78-113 + surface·radius·shadow 섹션). `[SRC]` 전 행 브라우저 실측으로 렌더값 확인(다크): background `rgb(31,22,24)`, surface-1 `rgb(43,32,35)`, surface-2 `rgb(58,44,48)`, muted-foreground `rgb(185,164,169)`, primary-text `rgb(255,218,218)`. `[BR]`

### 3-1. 시맨틱 (다크 기본 / 라이트)

| 토큰 | 다크 | 라이트 | 용도·상태 |
|---|---|---|---|
| `--background` | `#1f1618` | `#fff9f9` | 페이지 기저. 공용 |
| `--foreground` | `#fbeeee` | `#3a2c30` | 본문·제목. 공용 |
| `--surface-1` | `#2b2023` | `#ffffff` | 카드/팝오버 원면. `--card`·`--popover`의 별칭 원본 |
| `--surface-2` | `#3a2c30` | `#fff0f0` | `--secondary`·`--muted` 별칭 원본 |
| `--surface-3` | `#3a2c30`(=2와 동값) | `#ffffff` | 중립 컨트롤 hover 단계(관례상 "플로팅 오버레이"에서 승격, 주석 기록) |
| `--primary` | `#ffdada` | `#ffdada` | **surface 용도**(tint `bg-primary/10`+`text-primary-text` 조합). solid CTA 아님 |
| `--primary-foreground` | `#3a1a22` | `#4f1c2a` | `bg-primary` 위 라벨 |
| `--brand` | `#f98aa0` | `#ee6f8b` | 소스 전용(유틸리티 매핑 없음). `--primary-control`·`--ring`(다크)의 원본 |
| `--primary-control` | `var(--brand)` | 동일 | 솔리드 CTA 채움 |
| `--primary-control-hover` | `#f27890` | `#f27c96` | CTA hover |
| `--primary-control-text` | `var(--primary-foreground)` | 동일 | CTA 라벨 |
| `--primary-text` | `var(--accent-foreground)`=`#ffdada` | `#4f1c2a` | 강조 텍스트 표준(수백 곳) |
| `--muted-foreground` | `#b9a4a9` | `#7d686d` | 2차 텍스트(수백 곳) |
| `--accent` / `-foreground` | `#4d3b40` / `#ffdada` | `#ffc3c9` / `#4f1c2a` | 메뉴 hover·선택 |
| `--border` (`--input` = 별칭) | `#4d3b40` | `#f3d3d6` | `border-border`·`bg-input`(인풋 채움=보더 토큰) |
| `--border-subtle` | `#3a2c30` | `#f8e1e4` | 미세 구분선 |
| `--border-strong` | `#a37d89` | `#b4779b` | `--control-boundary` 소스(컨트롤 1px 경계) |
| `--ring` | `var(--brand)` | `#c4476a`(AA-safe 어두운 변형) | `focus-visible:ring-2` 전반 |

### 3-2. 컴포넌트 테마 전용 (다크는 color-mix 파생)

| 토큰 | 용도 | 상태 |
|---|---|---|
| `--outline-fill(-hover)` | outline 버튼 채움 | 컴포넌트 전용 |
| `--input-group-fill(-disabled)` | InputGroup 채움 | 컴포넌트 전용 |
| `--switch-thumb` `#ffffff` | Switch 손잡이(고정) | 컴포넌트 전용 |
| `--input-group-invalid-ring`, `--destructive-focus-fill` | 소비처 grep 미확인 | **미사용 의심** |
| `--control-boundary(-invalid)` | `inset 0 0 0 1px var(--border-strong)` / destructive | 보더리스 컨트롤 경계의 핵심 관례 |

### 3-3. 상태·랭킹·도트

- status: `--destructive` `#ff7b8a`/`#d4183d`, `--success` `#34d399`/`#0f7a52`, `--warning` `#fbbf24`/`#9a6100`, `--info` `#38bdf8`/`#0b6bb0`. **4종 `-foreground`는 전부 소비자 0 (삭제 보류 명시)**. `--info` 본체도 실사용처가 `/design` 쇼케이스 수준(저사용). `[SRC]`
- 랭킹: `--rank-1/2/3` (금/은/동, 라이트·다크 각각 정의) — `track.tsx` 소비. `[SRC]`
- `--dot-neutral` = `var(--muted-foreground)` — status-dot·badge·일부 인라인(voice-server-history) 공용. `[SRC]`

### 3-4. Discord 미리보기 팔레트

`--discord-embed/text/text-muted/btn-active/btn-hover/bg`(라이트·다크 각각) + 고정값 `--color-discord-primary #5865f2`·`discord-light #949cf7`·`discord-voice #23a559`(문서화된 하드코드 예외). `--color-discord-blue #00a8fc`은 **소비처 0 (미사용 의심)**. Discord 브랜드 블루퍼플이 랜딩 카드 안에서만 사용 — 브랜드 핑크와 톤 이질감은 의도된 "실제 Discord 재현"이므로 결함으로 분류하지 않음(§12 F-LOW-02는 쇼케이스 맥락 기록). `[SRC+BR]`

### 3-5. 대비 실측 (토큰 조합, WCAG 산술)

프로젝트 자체 검증 스크립트 `apps/dashboard/scripts/wcag-contrast-audit.py`: **Unexpected failures: 0** (문서화된 expected fail 8건 = fill 단독 경계·switch thumb 등 컨트롤 식별 규칙). `[SRC]` 주요 산출:
- muted-foreground: 다크 배경 위 7.54:1, surface-1 위 6.71:1, surface-2 위 5.65:1 → 토큰 조합 자체는 AA 통과. `[BR]`
- 그럼에도 **감산 스크린샷 관찰**에서 muted 톤 텍스트가 "묻힌다"고 반복 인식됨(§12 E-01): 값이 AA를 넘더라도 11~12px의 `text-2xs`·`text-xs` 조합에서 체감 대비가 낮음 — 크기·명도 이중 요인. `[BR]`
- 라이트 모드: muted `#7d686d`/`#fff9f9` = 4.95:1 통과. `[BR]`

## 4. 타이포그래피

- **폰트**: Pretendard Variable + Pretendard JP Variable (next/font local, `--font-pretendard(-jp)`), Twemoji Mozilla(unicode-range lazy) → 시스템 폴백. `font-sans` 스택 = Pretendard → JP → Twemoji → system. 렌더 실측 `font-family: pretendard` — 한글 웨이 900 흑체형 랜딩 헤드라인. `[SRC+BR]`
- **토큰**: 기본 스케일은 Tailwind v4 기본(`text-xs` 12px … `text-6xl` 60px). 커스텀: `--text-2xs` = 11px/lh 16px, `--text-3xs` = 8px/lh 12px(**소비처 1곳** `mock-thumbnail.tsx`). `text-[10px]`/`text-[11px]` 리터럴은 잔존 0건. `[SRC]`
- **페이지 제목 관례**: `text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter` (홈 H1 실측 60px/900/-3px, 트랙 H1 48px/900/-2.4px). `[BR]` PageHeader(`layout/page-header.tsx`)는 `text-3xl→5xl font-black tracking-tighter`. `[SRC]`
- **본문/2차 텍스트**: `text-muted-foreground`가 2차 텍스트 사실상 표준(수백 곳). `[SRC]`
- **렌더 실측 분포(홈, 1440)**: 11px 93개, 12px 45개, 14px 85개, 16px 18개, 18px 23개, 60px H1 1개 — 전체 텍스트 노드의 상당수가 11~14px 대역. `[BR]`

## 5. 간격·레이아웃

- **간격 토큰**: 별도 스케일 없음 — Tailwind 기본 스텝(px-4/6/8, gap-4/6/8/12, p-5 카드 표준 `Card padding="md"`=p-5) + 1px hairline(`gap-px bg-border-subtle` 메뉴판 그리드). `[SRC]`
- **컨테이너**: `Container`(`components/container.tsx`) = `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8` + `min-h-[calc(100svh-var(--navbar-h))]`. navbar·footer·홈 3섹션이 동일 산식 재사용. 대시보드형 다이얼로그 예외 `max-w-6xl`. `[SRC]`
- **브레이크포인트**: 커스텀 정의 **없음** — Tailwind 기본 sm 640 / md 768 / lg 1024. 실사용 집중: 모바일 탭바·사이드바 전환 = `md:`/`lg:`, 그리드 변환 = `sm:`/`md:`/`lg:`. `[SRC]`
- **navbar 기준 산식**: `--navbar-h` 4rem — `sticky top-[calc(var(--navbar-h)+…)]`(design TOC), `min-h-[calc(100svh-var(--navbar-h))]`(초점 페이지 5곳 공용 산식), hero `pt-8 sm:pt-16 lg:pt-20`. `[SRC]`
- **z-index 관례**: 오버레이 z-50(Dialog/Sheet/Dropdown/Select/모바일 탭바), SaveBar z-30, 스크롤탑 z-40, 토스트 `--toast-z` 100. **예외**: `components/servers/mixer-info.tsx:163·169` `z-[190]`/`z-[200]` 임의값(팝오버가 토스트 100보다 위 — 토스트 가림 가능성, §12 F-04). `[SRC]`
- **레이아웃 임의값 산식 반복**: `min-h-[calc(100svh-var(--navbar-h))]` 5곳, safe-area `pb-[calc(…+env(safe-area-inset-bottom))]` 4곳, 프리뷰 고정 프레임(`h-[300px]`류) 다수 — 1회성이지만 동일 목적 산식이 반복되어 토큰화 후보. `[SRC]`
- **레이아웃 실측**: 전 뷰포트(1440/768/390)에서 수폵 오버플로우 0건. `[BR]`

## 6. 모양·경계·그림자·모션

- **radius**: `--r-control` 0.625rem(컨트롤 표준, 최다 사용), `--r-menu` 0.75rem, `--r-card`/`--r-dialog` 1rem, 레거시 `--radius` 1rem(`rounded-sm/md/lg` 수식 유지 — skeleton·일부 코드에 `rounded-md` 잔존). `--r-control-inner`은 소비처 미확인(미사용 의심). `rounded-full`은 배지·칩·상태점·약알로 한정 관례. `[SRC]`
- **경계**: 컨트롤은 보더리스 — `shadow-control-boundary`(inset 1px `--border-strong`)가 경계 역할. 카드도 `border-0` + shadow-sm. **예외 이원화**: `InputGroup`은 `border border-input` 실선 유지(`ui/input-group.tsx:17`) — Input 본체(border-0+inset)와 관례 충돌(§12 F-02). `[SRC]`
- **elevation**: `--elev-1/2/3/5` → `shadow-sm/md/lg/2xl`. sm=헤어라인 카드, 2xl=메뉴·모달 표준. `shadow-md`는 소비처 희박(저사용). `xs/xl/elev-4`는 미정의(의도적 삭제). `[SRC]`
- **모션**: `--motion-fast` 200ms / `--motion-base` 300ms / `--motion-slow` 500ms + `--ease-out-expo`. 유틸리티 `duration-fast/base/slow`, `transition-control`, `animate-page-in`(라우트 전환, `template.tsx` 전역), `animate-pulse-soft`(무한 루프 — loader·status-dot, 문서화 예외군), `pop-in`/`stagger-rise`(드롭다운·select), view-transition 500ms(테마 토글). **부재**: `animate-marquee`는 코드에 실체 없음(DESIGN.md 문서에만 존재 — 문서 불일치, §12 F-06). `[SRC]`
- **reduced-motion**: 전역 무효화 블록(`globals.css:593-602`) + framer-motion `MotionConfig reducedMotion="user"`. `[SRC]`
- **framer-motion 인라인 값 토큰 미참조**: `hero-section.tsx`(spring/stagger 0.12), `features-section.tsx`(0.25/0.3/0.04), `motion/reveal.tsx`(duration 0.5), `track.tsx:82`·`streaming-type-text.tsx:79`(인라인 CSS duration) 등 — 반면 `server-stats-tab.tsx`는 `var(--motion-base)` 준수(이행 예와 미이행 혼재, §12 F-05). `[SRC]`

## 7. 컴포넌트 인벤토리

공용 컴포넌트 전수 조사 결과(주요 것만; 전체 원표는 감사 에이전트 보고서 기반):

| 컴포넌트 | 소스 | variants/규격 | 비고·상태 |
|---|---|---|---|
| Button | `ui/button-variants.ts` + `ui/button.tsx` | variant 11종(default≡primary, danger≡destructive 별칭 계약), size 9종(xs h-6 ~ lg h-10, icon size-6~10), `loading`·`active`·`icon` props | cva 단일 소스, 서버 세이프. 공용 표준 |
| Card | `ui/card.tsx` | variant default/muted/raised/interactive, padding none/sm/md(5)/lg(6) | `rounded-card border-0 bg-card shadow-sm`. 공용 표준 |
| Input/Textarea | `ui/input.tsx`, `ui/textarea.tsx` | 규격 없음 | `bg-input`(=보더 토큰) + inset 경계. aria-invalid → destructive 링 |
| InputGroup | `ui/input-group.tsx` | addon 4종 | **실선 border 관례로 Input과 이원화** |
| Badge | `ui/badge.tsx` | tone 12종 + dot 12종, size sm/md | tone/dot 상수 분리(동기화 부담, 주석 명시) |
| Tabs | `ui/tabs.tsx` | list variant default/line | 활성 하단선 `bg-primary-control` |
| Select | `ui/select.tsx` | trigger sm/default | popup `rounded-menu shadow-2xl` |
| SearchableSelect | `servers/searchable-select.tsx` | 단일/다중 | servers 소속이나 discord·home까지 광역 소비. popup 항목에 레거시 `rounded-md` 잔존 |
| Switch | `ui/switch.tsx` | sm 36×20 / md 44×24 | on=`bg-primary-control`, thumb 고정 백 |
| Dialog/Sheet | `ui/dialog.tsx`, `ui/sheet.tsx` | side 4종(Sheet) | overlay `bg-black/60 backdrop-blur-sm`(blur+opacity 금지 주석), `rounded-dialog` |
| Toast | `ui/toast.tsx` | success/error/warning/info | 모듈 매니저 `toastManager`, `z-(--toast-z)`=100 |
| Command | `ui/command.tsx` | — | 실사용처 `overlay/global-command-palette.tsx` 1곳(⌘K). `[BR]` 동작 확인 |
| Field/Label | `primitives/field.tsx`, `ui/label.tsx` | label/description/error(role=alert)/required | 렌더프롭 id 연동 |
| StatusDot | `primitives/status-dot.tsx` | ready/idle/connecting/disconnected/errored, size 3종, pulse | Badge 톤 재사용(통합 모벃� 사례) |
| EmptyState | `primitives/empty-state.tsx` | size sm/md, action | `rounded-card bg-surface-2` |
| Skeleton 계열 | `ui/skeleton.tsx` | Line/Circle/Card | `animate-pulse bg-muted` |
| Loader | `loader.tsx` | size 5종, fullPage | **스핀 로딩의 별도 체계 — Skeleton과 이원화**(§12 F-01) |
| ErrorPanel | `error-panel.tsx` | onRetry | EmptyState에 error 톤이 없어 별도 존재(구조적 중복) |
| StatCard | `data/stat-card.tsx` | trend up/down/neutral | `useCountUp` 내장 |
| Avatar | `ui/avatar.tsx` | xs/sm/md/lg, status 4종 | CDN URL은 `lib/discord-cdn` |
| PageHeader | `layout/page-header.tsx` | title/description/action | `mb-6 pb-6` 이중 여백(스켈레톤도 동일 재현) |
| Container | `container.tsx` | — | §5 참조 |
| Navbar | `navbar.tsx` | sticky, 세그먼트 pill(`bg-surface-1 h-11`), View Transition 토글 | `[BR]` 데스크톱 링크 내비게이션 동작 확인 |
| MobileTabBar | `navbar/mobile-tab-bar.tsx` | 항목 5종 | framer 드래그 알약, `md:hidden`, 항목 `min-h-12` 50px 히트 영역. `[BR]` 탭 전환 동작 확인(우측 탭) |
| GuildCard | `servers/guild-card.tsx` | isInstalled/isManageable 분기 | `buttonVariants()` + 링크별 상이 오버라이드(h-11→md:h-12 등) — variant 밖 규격 |
| ServerSwitcher | `servers/server-switcher.tsx` | Popover/Sheet 3중 | 미설치 길드 → 초대 CTA |
| Discord 목업군 | `home/discord-command-animation.tsx`, `home/previews/*` | — | `discord-*` 토큰 기반 재현. `rounded-md` 임베드 바 등 고유 관례 |
| TrackListenLink | `track-listen-link.tsx` | compact | Button variant에 없는 자체 a 스타일(§12 F-03) |
| SaveBar/PanelHeader/ModePicker 등 | `servers/settings-shared.tsx` | — | 서버 설정 도메인 공용군 |
| **미존재** | — | — | `DataTable`·`TagInput`·`NotificationStack`은 DESIGN.md 언급만 있고 **코드 부재**(§12 F-07). `/design`의 데이터 표는 갤러리 데모(`design/_sections/data-section.tsx`) |

raw `<button>` 사용처 20+곳 — 분류 결과 대부분 `selector`(tab/radio/pill, 12곳)·`menu`(항목 리스트, 5곳)·`action`(아이콘/토글)·`link`형 텍스트 버튼으로, 스킬 문서의 "raw 유지" 기준에 부합. 다만 `guild-card.tsx`(variant 우회 오버라이드), `track.tsx FavoriteButton`(자체 스타일 토글), `track-listen-link`(자체 링크 스타일)은 Button 체계 밖 자체 구현. `[SRC]`

## 8. 내비게이션·페이지 레이아웃

- **전역 셸**(`src/app/layout.tsx`): `Navbar`(sticky h-16) + `main`(flex-1) + `Footer` + `ScrollToTop` + `GlobalCommandPalette` + `BackgroundShapes`(장식) + 모바일 하단 `MobileTabBar`. 본문 최상단 `div.min-h-svh … pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0` — 모바일 탭바 공간 확보. `[SRC]`
- **template.tsx**: 모든 페이지가 `PageTransition`(`animate-page-in`)으로 래핑. `[SRC]`
- **데스크톱 nav**: 상태(/shards)·차트(/track)·프로필·플레이리스트·대시보드(미인증 시 signin 링크로 치환, `navbar/links.ts` `getNavHref`). `[BR]` 미인증 세션에서 프로필/플레이리스트/대시보드가 `/api/auth/signin?callbackUrl=…`로 렌더 확인. 렌더 순서는 첫 focus가 우상단 "시작하기" 버튼(탭 순서가 로고 이전 — `[BR]` DOM 순서상 버튼이 먼저).
- **모바일**: 데스크톱 링크 row `hidden`, 하단 플로팅 알약 탭바(`md:hidden`, max-w-26rem, `bg-background/60 backdrop-blur-xl`, 드래그 제스처 + 클릭 가드). `[SRC+BR]`
- **페이지 골격 관례**: `Container` + `PageHeader(title, description, action)` + 콘텐츠 스택. 예외: 초점형 4페이지(404·login·invite·error)는 `FocusPageShell`(`app/_components/focus-page-shell.tsx`, 32rem `bg-primary/[0.04] blur-3xl` 앰비언트). `/design`만 자체 헤더 + sticky TOC(`sticky top-[calc(var(--navbar-h)+3rem)]`). `[SRC]`
- **도메인별**: `/servers/[id]` = lg+ 사이드바 카드(`Card padding="none"`+p-2 항목) ↔ 모바일 탭 스트립 전환(`server-dashboard.tsx:167-181`). `/playlists` = `PlaylistSidebar`(lg+) + 모바일 셀렉트 + virtualizer 트랙 테이블. `/player/[id]` = `web-player-section`(PlayerLiveTab + VoiceStatusBadge + 검색). `[SRC]`

## 9. 라우트 인벤토리·시각 커버리지

페이지 라우트 15종(라우트 그�프 없음, 동적 하위 page 없음 — `/playlists`가 쿼리 상태로 상세 렌더). `[SRC]`

| 라우트 | 유형 | 인증 | 핵심 컴포넌트 | 1440 | 768 | 390 | 비고 |
|---|---|---|---|---|---|---|---|
| `/` | 랜딩 | 공개 | Hero·Features·CommandList·InviteTicket | ✅ | ✅ | ✅ | H1·토큰 실측 |
| `/login` | 초점형 | 공개(세션 있으면 redirect) | FocusPageShell, Discord CTA | ✅ | — | ✅ | |
| `/track` | 데이터(공개) | 공개 | PageHeader+SearchInput+TrackList+EmptyState | ✅ | ✅ | ✅ | API 실데이터 0건 상태로 확인 |
| `/contributors` | 카드 그리드 | 공개 | 4열 카드 | ✅ | — | ✅ | 11명, 마지막 행 3개 |
| `/licenses` | 목록 | 공개 | Card+Badge | ✅ | — | — | |
| `/invite` | 초점형(카운트다운) | 공개 | Loader, CTA | ✅ | — | — | redirect_uri가 beta.siru.life(환경 기인) |
| `/error` | 초점형 | 공개 | 3종 메시지 분기 | ✅ | — | — | |
| `/design` | 갤러리 | 공개 | TOC+7섹션 | ✅ | — | — | Primitives·Discord 섹션 검사 |
| `/shards` | 운영 | 렌더 공개/API admin | ErrorPanel(연결 실패 시) | ✅(에러 상태) | — | — | 정상 데이터 화면 미검증 |
| `/servers` | 목록 | 세션 | 미인증 → 로그인 콘텐츠로 폴백 | ✅(미인증) | — | — | 인증 상태 미검증 |
| `/no-such-page` | 404 | 공개 | FocusPageShell+ShapeBand | ✅ | — | ✅ | |
| `/servers/[id]` | 대시보드 | 세션+멤버십 | ServerDashboard | ❌ | ❌ | ❌ | 인증 필요 — 미검증 |
| `/playlists` | 도메인 | 세션 | PlaylistSidebar+Detail | ❌ | ❌ | ❌ | 미검증 |
| `/player/[id]` | 도메인 | 세션+멤버십 | WebPlayerSection | ❌ | ❌ | ❌ | 미검증 |
| `/profile` | 도메인 | 세션 | ProfileView | ❌ | ❌ | ❌ | 미검증 |
| `/invite/redirect` | 초점형 | 공개 | CheckCircle | ❌ | ❌ | ❌ | Discord OAuth 왕복 필요 — 미검증 |

상태 파일: root `error.tsx`/`not-found.tsx`, `servers/[id]`·`playlists` loading+error, `shards`·`profile`·`contributors` 동형 스켈레톤, `player/[id]`·`playlists` `Loader fullPage`. **루트 `loading.tsx` 없음**. `[SRC]`

## 10. 반응형 동작

- **브레이크포인트 전환 실측**: 1440 히어로 2열 → 768 단일 열 중앙(CTA·통계가 세로 스택, 프리뷰가 하단 full-width) → 390 동일 단일 열. `[BR]`
- **모바일 적응**: 데스크톱 nav row `hidden`(390에서 렌더 폭 0 실측), 하단 플로팅 탭바 등장(항목 70×50px — 44px 기준 충족). layout 본문 `pb-[calc(5.25rem+safe-area)]`로 탭바 침범 없음. `[BR]`
- **오버플로우**: 전 라우트×3 뷰포트 수평 오버플로우/클리핑 **0건**. 홈 390 세로 9,597px(긴 랜딩 정상). `[BR]`
- **히어로 여백**: navbar 하단→hero 상단 gap 1px(섹션 시작), 하지만 H1까지 내부 pt(sm:16=64px, lg:20=80px)+요소 흐름으로 시각적 공백 발생 — "GNB 아래 빈 공간이 넓다"는 관찰이 768/1440 모두에서 반복됨(§12 C-01). `[BR]`
- **정렬 관찰**: 히어로 좌텍스트/우카드 top 정렬은 실측상 동일(249px)하나, 우카드 내부의 탭 라벨("Discord에서 이렇게 동작해요" 행)이 카드보다 위로 돌출해 시각적으로 어긋나 보임(§12 A-01). `[BR]`
- **미검증**: 서버 대시보드·플레이리스트·플레이어의 모바일 사이드바→탭 전환(인증 필요), 768에서의 도메인 페이지들.

## 11. 인터랙션·접근성 관찰

- **포커스 링**: Button·Input = `focus-visible:ring-2 ring-ring` 관례(토큰 준수). raw 네이버 링크는 브라우저 기본 `outline: auto`에 의존. 사이드바·ModePicker 등 일부는 `ring-ring/40`·`/50` 투명도 변형 혼용(§12 D-01). `[SRC+BR]`
- **키보드**: 첫 Tab이 로고가 아닌 우상단 "시작하기" 버튼에 착지(`[BR]` DOM 순서 — 히어로 CTA보다 먼저 포커스를 받는 것은 탭 순서 관점에서 위계 역전). `[BR]`
- **⌘K 팔레트**: 동작 확인("이동 홈 서버 상태 음악 차트" 렌더). Escape로 닫힘. `[BR]`
- **테마 토글**: 다크↔라이트 전환 동작 확인(View Transitions). `[BR]`
- **모바일 탭바**: 항목 클릭 내비게이션 동작 확인(우측 항목). 첫 탭("상태") 좌표는 Next.js dev 오버레이 배지가 정확히 가려 클릭 차단 — **dev 환경 한정 아티팩트로 앱 결함 아님**(§14). `[BR]`
- **하이드레이션 경고**: "A tree hydrated but some attributes of the server rendered HTML didn't match" — 감사 세션(라이트 모드 토글→리로드, dev HMR)에서만 재현, 클린 탭 재방문 시 소실. 감사 환경 기인 가능성이 높으나 dev 오버레이 "Issue" 카운트의 원인. 재현 조건 불확실 — 확정 결함으로 분류하지 않음(§14). `[BR]`
- **next/image 경고**: `/images/profile.png` `fill`에 `sizes` 누락 — 전 라우트에서 반복 발생(성능 경고, §12 F-08). `[BR]`
- **감산 관찰 대비 문제**: muted 텍스트·placeholder·Discord 목업 내 메타 텍스트가 다크 배경에서 낮게 인식됨(§12 E-01, §3-5 참조 — 토큰 산술은 AA 통과이므로 "크기·맥락 결합" 문제로 기록). `[BR]`
- **정식 접근성 테스트(axe·스크린리더)는 미실행** — 상기는 키보드·산술·감산 관찰만.

## 12. 시각·기술 파인딩

구분: **확정**(소스+브라우저 교차 또는 명백한 소스 사실) / **관찰**(브라우저 감산, 주관 배제 가능 수준으로 기술).

### A. 일관성

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| A-01 | Medium | 히어로 우측 Discord 프리뷰의 라벨/탭 행이 카드 프레임보다 위로 돌출 — 좌우 열 top 정렬(실측 동일 249px)이 시각적으로 어긋나 보임. 홈 히어로. | `[BR]` |
| A-02 | Medium | 로딩 표현 3체제: `Loader`(스핀) / `Skeleton*`(구조 동형) / 인라인 텍스트. 페이지별 선택 기준이 문서화되지 않음(player-live-tab은 Skeleton+텍스트 혼합, playlists는 Loader fullPage, shards/profile은 동형 스켈레톤). | `[SRC]` |
| A-03 | Medium | 빈 상태 2체제: `EmptyState` vs 플레인 텍스트("검색 결과가 없어요." — searchable-select·playlist-sidebar 등 동일 문구를 컴포넌트 없이 처리). | `[SRC]` |
| A-04 | Low | 카드 중첩 내부 패딩 규격 3종 병존(p-3 / p-4 / p-4+space-y-2) — data-api·voice-server·process-card 섹션. | `[SRC]` |
| A-05 | Low | 컨트롤 높이 미세 불일치: h-8/9/10(variant) + h-11(터치) + guild-card md:h-12 + `track.tsx` FavoriteButton h-8 sm:h-10. | `[SRC]` |
| A-06 | Low | 레거시 radius 잔존: playlist-sidebar·searchable-select popup 등 `rounded-md`(토큰 아님) — `rounded-menu` 관례와 혼재. | `[SRC]` |

### B. 시각 위계

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| B-01 | Low | `/track` 통계 박스("단일 곡 수 0 / 재생 횟수 0")가 구분 없이 나란히 — 레이블·숫자 구분이 텍스트 간격에만 의존(관찰). | `[BR]` |
| B-02 | Low | `/track` 빈 카드가 화면 대비 과도한 높이로 텅 빈 인상 + 진행 표시(스피너/스켈레톤) 없음 — "모으고 있어요"가 empty인지 loading인지 분간 불가(관찰). EmptyState 문구는 원인은 전달하나 다음 행동·CTA 부재. | `[BR]` |
| B-03 | Low | `/contributors` 마지막 행 3/4 불균형(11명 — 그리드 특성상 자연 발생, 개선 여지로만 기록). | `[BR]` |

### C. 레이아웃·반응형

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| C-01 | Medium | 히어로 상단 여백 과대 관찰: GNB 하단→H1까지 390/768/1440 모두에서 "빈 공간이 넓다"로 반복 인식됨(실측 gap 65px@768 — `pt-8 sm:pt-16 lg:pt-20` + `content-center` 조합). | `[BR]` |
| C-02 | Low | 수평 오버플로우·클리핑 없음(전 라우트×3 뷰포트) — 반�형 안정성은 현 수준 양호. | `[BR]` |

### D. 컴포넌트 품질

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| D-01 | Medium | focus ring 규격 혼용: `ring-2 ring-ring`(Button/Input/Select 표준) vs `ring-ring/40`(server-feature-sidebar·ModePicker·layer-panel·player-client) vs `ring-ring/50`(input-group). | `[SRC]` |
| D-02 | Medium | Button 체계 밖 자체 컨트롤: `guild-card.tsx`가 `buttonVariants()`에 링크별 상이 오버라이드(h-11→md:h-12, bg-primary/10 등), `track.tsx` FavoriteButton 자체 스타일, `track-listen-link.tsx` 자체 링크 스타일 — 동일 역할 컨트롤의 외형 분화. | `[SRC]` |
| D-03 | Low | `/design` 토큰 스와치에서 다크 계열 색상의 형태 소실(외곽선 없음) — 갤러리 가독성 문제(관찰, 앱 결함 아님). | `[BR]` |

### E. 접근성·가독성

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| E-01 | High | 저대비 인식 반복 관찰: muted 텍스트(`#b9a4a9`), placeholder, Discord 목업 메타 텍스트가 다크 배경에서 "묻힌다"고 다수 화면에서 관찰. 토큰 산술은 AA 통과(5.65~7.54:1)이나 11~12px 대역과 결합 시 체감 가독성 저하. **정식 wcag 스크립트는 통과 상태** — 크기·명도 이중 요인으로 개선 영역. | `[BR]` 감산 + `[SRC]` 산술 |
| E-02 | Medium | 첫 Tab 착지가 "시작하기"(우상단) — 포커스 순서가 본문·로고보다 CTA 먼저(탭 순서 위계). raw 네비 링크는 기본 outline에 의존. | `[BR]` |
| E-03 | Info | 프로젝트 WCAG 스크립트: unexpected failure 0 — 토큰 조합 수준의 대비는 체계적으로 관리되고 있음. | `[SRC]` |

### F. 기술 부채

| ID | 심각도 | 내용 | 근거 |
|---|---|---|---|
| F-01 | Low | 로딩/에러 표현 이원화의 구조적 원인: EmptyState에 error 톤이 없어 ErrorPanel이 별도 레이어로 존재, Loader/Skeleton 선택 기준 부재. | `[SRC]` |
| F-02 | Medium | Input 보더 관례 이원화: Input/Textarea는 border-0+inset shadow, InputGroup은 `border border-input` 실선. | `[SRC]` `ui/input-group.tsx:17` |
| F-03 | Low | 미사용/부재 토큰군: `--success/warning/info/destructive-foreground`(소비자 0), `--destructive-focus-fill`, `--input-group-invalid-ring`, `--r-control-inner`, `--color-discord-blue`, `shadow-md`(저사용), `--animate-marquee`(코드 부재). | `[SRC]` |
| F-04 | Medium | `mixer-info.tsx:163·169` 임의값 z-`[190]`/`[200]` — 토스트(100) 위. z 체계 토큰화 누락. | `[SRC]` |
| F-05 | Low | framer-motion 인라인 duration/stagger 값이 토큰 미참조(hero 0.12, reveal 0.5, features 0.25 등) — `server-stats-tab`은 준수. 모션 토큰 이행 불완전. | `[SRC]` |
| F-06 | Low | 문서-코드 불일치: DESIGN.md의 `animate-marquee`(코드 부재), `DataTable/TagInput/NotificationStack` 언급(코드 부재), `--z-toast`→실제 `--toast-z`+`z-(--toast-z)` 문법. | `[SRC]` |
| F-07 | Low | `layout.tsx:14` themeColor `#1f1618` 하드코드(정적 메타데이터 제약 — 토큰 참조 불가, 기록용). | `[SRC]` |
| F-08 | Low | next/image `fill`+`sizes` 누락 경고 `/images/profile.png` — 전 페이지 반복(성능). | `[BR]` |

### 환경 기인(앱 결함 아님 — 구분 기록)

- Next.js dev 오버레이 배지("N Issue")가 모바일 첫 탭 좌표를 가림 — dev 전용. `[BR]`
- `/invite`·미인증 도메인 링크의 `callbackUrl`이 `beta.siru.life`로 생성 — 워크트리 `.env`의 `NEXT_PUBLIC_APP_URL` 값 기인(프로덕션 배포에서는 정상). `[BR]`
- 감사 세션에서 hydration 불일치 경고·`Module not found` pageerror는 **감사용 워크트리의 빌드 산출물 세팅 과정**에서 발생한 것으로, 원본 저장소의 상태가 아님(§14).

## 13. 현행 토큰 레퍼런스 (검증분 요약)

정의 위치 전제: `src/app/globals.css`(별도 표기 없으면 해당). 상태 범주: **공용** / **컴포넌트 전용** / **소스 전용** / **저사용** / **미사용 의심** / **부재**.

| 토큰/유틸리티 | 값(다크) | 용도 | 상태 |
|---|---|---|---|
| `--background` / `--foreground` | `#1f1618` / `#fbeeee` | 기저·본문 | 공용 |
| `--surface-1/2/3` | `#2b2023`/`#3a2c30`/`#3a2c30` | 카드·중립 hover | 공용 |
| `--primary` | `#ffdada` | tint surface | 공용 |
| `--brand` | `#f98aa0` | 소스 전용 | 소스 전용 |
| `--primary-control(-hover/-text)` | `var(--brand)`/`#f27890`/`var(--primary-foreground)` | CTA | 공용 |
| `--primary-text` | `#ffdada` | 강조 텍스트 | 공용 |
| `--muted-foreground` | `#b9a4a9` | 2차 텍스트 | 공용 |
| `--border(-subtle/-strong)` | `#4d3b40`/`#3a2c30`/`#a37d89` | 경계 | 공용 |
| `--control-boundary` | `inset 0 0 0 1px var(--border-strong)` | 보더리스 컨트롤 경계 | 공용 |
| `--ring` | `var(--brand)` | focus | 공용 |
| `--success/-foreground` | `#34d399` / 소비자 0 | 상태 | 공용 / 미사용 의심 |
| `--warning/-foreground` | `#fbbf24` / 소비자 0 | 상태 | 공용 / 미사용 의심 |
| `--destructive/-foreground` | `#ff7b8a` / 소비자 0 | 상태 | 공용 / 미사용 의심 |
| `--info/-foreground` | `#38bdf8` / 소비자 0 | 상태 | 저사용 / 미사용 의심 |
| `--rank-1/2/3` | `#f0b232`/`#b9bbbe`/`#cd7f32` | 차트 랭킹 | 공용 |
| `--dot-neutral` | `var(--muted-foreground)` | 상태점 중립 | 공용 |
| `--discord-embed/text/text-muted/btn-active/btn-hover/bg` | `#2b2d31` 등 | Discord 목업 | 공용 |
| `--color-discord-primary/light/voice` | `#5865f2`/`#949cf7`/`#23a559` 고정 | Discord 브랜드 | 공용(하드코드 예외) |
| `--color-discord-blue` | `#00a8fc` | — | 미사용 의심 |
| `--font-sans` | Pretendard→JP→Twemoji→system | 전역 | 공용 |
| `--text-2xs` / `--text-3xs` | 11px/16px · 8px/12px | 마이크로 라벨 | 공용 / 저사용(1곳) |
| `--r-control/menu/card/dialog` | 0.625/0.75/1/1rem | 역할별 라운드 | 공용 |
| `--r-control-inner` | 0.375rem | — | 미사용 의심 |
| `--radius`(+`rounded-sm/md/lg` 수식) | 1rem | 레거시 | 공용(레거시) |
| `--elev-1/2/3/5` → shadow-sm/md/lg/2xl | 다중 그림자 | elevation | 공용(md 저사용) |
| `--motion-fast/base/slow` | 200/300/500ms | duration | 공용(slow 저사용) |
| `--ease-out-expo`→`ease-standard` | `cubic-bezier(0.16,1,0.3,1)` | easing | 공용 |
| `transition-control` / `animate-page-in` / `animate-pulse-soft` | @utility | 전환·진입·펄스 | 공용 |
| `--toast-z` | 100 (`z-(--toast-z)`) | 토스트 레이어 | 공용(단일 소비처) |
| `--navbar-h` | 4rem | 스티키 오프셋 | 공용 |
| `scrollbar-none` | @utility | 탭 스트립 | 공용 |
| `--animate-marquee` | — | — | 부재(문서만 존재) |

## 14. 감사 커버리지·한계

**수행**
- 소스: 라우트 전수(15 page + loading/error/not-found 파일), `src/components/` 전역 컴포넌트, `globals.css` 토큰 전수, 하드코드 값 전수 스캔(hex/px/ms), z-index 실측. 3개 분할 에이전트(토큰/컴포넌트/라우트) 병렬 조사.
- 브라우저: Playwright 계열 Puppeteer 런타임(헤드리스 Chromium)으로 `next dev` 서버 대상 실렌더 — 11 라우트×1440×900, 7 라우트×390×844, 2 라우트×768×1024, 스크린샷 20+장 감산 검토, computed style 실측(토큰 렌더값·H1 타이포·포커스 링·탭바 히트박스), 인터랙션(⌘K 팔레트·테마 토글·모바일 탭바 내비·hover 관찰), 콘솔/페이지에러 수집, 대비 산술(WCAG 스크립트 + 독립 계산).
- 감사 인프라: `@playwright/test` 패키지·전용 Playwright config는 **저장소에 부재**(테스트 스위트는 Vitest) — 감사는 harness 내장 브라우저 런타임으로 수행. 이후 자동 비교 회귀(스크린샷 diff)를 원하면 Phase 2에서 도입 결정 필요.

**미수행/불확실**
- 인증 필요 라우트 4종(`/servers/[id]`, `/playlists`, `/player/[id]`, `/profile`)과 `isManageable`/`isInstalled` 분기 UI, `/shards` 정상 데이터 화면, `/invite/redirect` — OAuth 자격 증명으로 실로그인 우회 없이는 접근 불가(인증 우회 금지 원칙). 구조는 소스 기반으로 기록.
- 정식 접근성 도구(axe·스크린리더·음성 입력), 색각 이상 시뮬레이션, 1024~1280 중간 폭, 라이트 모드 전수(라이트는 `/track` 1면만), 프로덕션 빌드 렌더.
- 감산 관찰(스크린샷 VQA)은 모델 해석 기반이므로 정량 아닌 항목은 "관찰"로 표기. C-01·E-01 등은 수치 실측과 교차 검증됨.
- **환경 한계 고지**: 감사용 worktree는 워크스페이스 패키지 dist(`@sirubot/utils`·`@sirubot/prisma` 등)가 커밋되지 않아 감사 중 수동 빌드·Prisma output 조정으로 구동했음(감사 종료 후 원복 — §15). 감사 세션 콘솔의 `Module not found` pageerror 일부와 hydration 경고는 이 환경 세팅 과정의 HMR 잔재로, 클린 세션에서 재현되지 않음.

## 15. Phase 2 권고(제안, 미구현)

우선순위 제안(효과×리스크 기준):
1. **인증 도메인 화면의 실측 감사**(§14 한계 해소) — OAuth 테스트 자격 증명 또는 스테이징 세션 재사용으로 `/servers/[id]`·`/playlists`·`/player/[id]`·`/profile`를 동일 매트릭스로 검증. 대시보드가 제품의 핵심 화면임에 현재 기준선이 소스 기반이다.
2. **마이크로 텍스트 가독성**(E-01·§4) — `text-2xs`(11px) 사용 밀도 축소 또는 muted-foreground 명도 상향. 토큰 산술은 이미 AA라 "크기 정책"으로 접근.
3. **로딩/빈 상태 체계 통합**(A-02·A-03·F-01) — Loader/Skeleton 선택 기준 문서화, EmptyState에 error/CTA 토큰 확장, ErrorPanel 흡수.
4. **포커스 링·z-index 토큰화**(D-01·F-04) — ring 투명도 단일화, `--z-*` 스케일 도입.
5. **Button 밖 자체 컨트롤 흡수**(D-02) — guild-card·FavoriteButton·TrackListenLink를 variant/size로 회귀.
6. **모션 토큰 이행 완료**(F-05) — framer 인라인 값의 `--motion-*` 참조 전환.
7. **죽은 토큰 정리**(F-03·F-06) — 미사용 의심군 확정 후 삭제 + DESIGN.md 동기화(`animate-marquee`·DataTable 등 문서-코드 불일치 수정).
8. **히어로 상단 리듬**(C-01·A-01) — pt 축소·프리뷰 라벨 정렬 정돈.
9. **InputGroup 경계 관례 통일**(F-02) — Input과 동일 inset 체계로.
10. **next/image sizes 부여**(F-08) — 일괄 수정 1건.


### 부기 (2026-10-24, Phase 2 재검증 정정)

Phase 2 진입 검증에서 §12·§13의 일부 "미사용 의심" 기록이 부정확했음이 확인됨(전수 grep 재확인):

- `--r-control-inner` — 소비처 **있음**: `ui/input-group.tsx:26·73·76`(addon·kbd·버튼). 미사용 아님.
- `--input-group-invalid-ring` — 소비처 **있음**: `ui/input-group.tsx:17` `has-[[aria-invalid]]` 링. 미사용 아님.
- `--destructive-focus-fill` — 소비처 **있음**: `ui/dropdown-menu.tsx:92` destructive 항목 focus 채움. 미사용 아님.
- `--warning-foreground`·`--destructive-foreground` — 소비처 **있음**: `ui/badge.tsx:14·16·17`(솔리드 톤, AA 사유 주석). 미사용 아님.
- `--success-foreground`·`--info-foreground` — 소비처 **0 확인 지속**.
- `--color-discord-blue`(`globals.css:161`) — 유틸리티 매핑만 존재, 클래스 소비처 **0 확인 지속**.
- 추가 확인: `web-player-section.tsx:317` 검색어 지우기는 raw `<button>`(Button 미사용)이나 `search-input.tsx:70`의 동일 역할은 Button ghost — 청소 버튼 구현 불일치(§12 D-02에 추가).
- `track/page.tsx:98-104`: `!loading && tracks.length===0`에서 "차트 데이터를 모으고 있어요..." 표시 — 영구 빈 상태가 진행형 문구로 표기됨(§12 B-02의 소스 근거 확정).
- `apps/dashboard/DESIGN.md:206`의 `animate-marquee` 허용 언급은 코드 부재(컴포넌트는 03971a7c에서 삭제) — 문서 스테일 확정.
---

*작성: 2026-10-24, `beta` @ bfff575b 기준. 감사 방법·환경 제약은 §14 참조.*