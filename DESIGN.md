---
version: 2.0
name: SiruBOT
description: >-
  디스코드 음악과 서버 관리를 위한 봇 및 웹 대시보드.
  시루떡처럼 따뜻하고 친근한 핑크와 마룬 아이덴티티.
  이 문서는 Phase 3 구현의 권위 있는 목표 디자인 사양이다.
colors:
  # 전체 의미 토큰 사전은 §4·§12 참조. 여기는 요약.
  primary: "#ffdada"          # 브랜드 표면(라이트/다크 동일) — tint 조합용
  primary-foreground: "#3a1a22" / "#4f1c2a"  # dark / light
  primary-control: "var(--brand)"           # CTA 채움 = #f98aa0 / #ee6f8b
  background: "#1f1618" / "#fff9f9"         # dark / light
  foreground: "#fbeeee" / "#3a2c30"
  muted-foreground: "#b9a4a9" / "#7d686d"   # 2차 텍스트
  ring: "var(--brand)" / "#c4476a"
  success: "#34d399" / "#0f7a52"
  warning: "#fbbf24" / "#9a6100"
  destructive: "#ff7b8a" / "#d4183d"
  info: "#38bdf8" / "#0b6bb0"
typography:
  sans: Pretendard Variable → Pretendard JP → Twemoji → system
  scale: 12 / 14 / 16 / 18 / 20 / 24 / 30 / 36 / 48 / 60px (§5)
  micro: text-2xs = 11px (§5.3 정책)
rounded:
  control: 0.625rem
  control-inner: 0.375rem
  menu: 0.75rem
  card: 1rem
  dialog: 1rem
spacing:
  unit: 4px (Tailwind 기본 스텝 유지)
  section: py-14 sm:py-20 lg:py-24 (랜딩)
  control-heights: "h-6(xs) / h-8(sm) / h-9(md·default) / h-10(lg) / h-11(touch 44px)"
  touch-min: 44px
motion:
  fast: 200ms
  base: 300ms
  slow: 500ms
  ease: cubic-bezier(0.16, 1, 0.3, 1)
---

# SiruBOT DESIGN.md — 목표 디자인 사양 (Phase 2)

기준일: 2026-10-24. 소스 확인 기준: `beta` @ `bfff575b` (워크트리 `docs/design-current-audit`).
근거 문서: [DESIGN.current.md](DESIGN.current.md) (Phase 1 감사 + Phase 2 재검증 정정 부기).
이 문서는 **목표 상태**를 규정한다. 현행 값과 다른 토큰은 §12 매핑 표의 "변경 유형"으로 구분한다.
구현(Phase 3) 전까지 어떤 애플리케이션 코드도 이 문서를 근거로 변경되지 않았다.

---

## 1. 디자인 개요

- **제품 맥락**: 한국어 Discord 이용자·서버 관리자가 음악을 듣고 서버 기능을 설정하는 웹 대시보드. 랜딩(공개)과 인증형 관리 콘솔(서버·플레이리스트·플레이어·프로필), 운영 페이지(상태·차트·라이선스·기여자)로 구성.
- **목표 경험**: 설정 작업이 "지금 이 패널에서 무엇을 저장해야 하는지" 명확히 읽히고, 데이터가 없을 때 원인과 다음 행동이 즉시 이해되며, 어떤 화면에서도 컨트롤의 상태(hover·focus·disabled·loading)가 일관된 언어로 표현되는 것.
- **디자인 방향**: 현행 "Pink Beret Music Bot" 아이덴티티(연핑크 표면 `#ffdada`·마룬 텍스트·보더리스 컨트롤·역할별 radius)를 **유지한다**. Phase 2는 아이덴티티 교체가 아니라 체계 정합성 회복이다 — 상태 표현 체계 통합, 포커스/z-index 토큰화, 마이크로 타입 정책, 문구-상태 정합성에 집중한다.
- **다이얼**: `ENERGY 2 / RHYTHM 2 / MOTION 2` 유지(루트 DESIGN.md v1 계약 승계).

### 1.1 핵심 디자인 원칙

각 원칙은 구현 판단을 대신한다. 새 디자인 결정이 필요하면 원칙에 비추어 판단하고 §13에 기록한다.

**P1. 상태는 체계로 말한다 (State before styling)**
- 사용자 이득: 어느 페이지에서든 loading·empty·error·disabled가 같은 문법이라 학습 비용이 0이 된다.
- 시각/인터랙션 함의: 상태 표현은 §8.10의 4-레이어 체계(구조 동형 Skeleton / 진행 Loader / 원인+다음행동 EmptyState / ErrorPanel)에서만 조합한다. 새로운 상태 표현(개별 spinner, 진행형 문구의 영구 상태 사용)을 만들지 않는다.
- 올바른 적용: `!loading && empty` → EmptyState(원인 + 다음 행동 문구). `loading` → 구조 동형 Skeleton(페이지 진입) 또는 인라인 Loader(범위 한정 갱신).
- 흔한 실수: 빈 상태에 "…하고 있어요" 진행형 문구(현행 `/track` 결함, D-08), Skeleton과 Loader를 같은 영역에 혼용.

**P2. 강조은 한 곳에만 (One accent per surface)**
- 사용자 이득: 주요 행동이 경쟁 없이 식별된다.
- 함의: 페이지당 솔리드 핑크 CTA(`cta`/`primary-control` 채움)는 1개. 나머지 액션은 secondary/ghost/outline. 네비게이션·배지·아이콘 동시 핑크 강조 금지(현행 navbar CTA가 유일한 핑크 계열 강조인 구조 유지).
- 실수: 카드마다 각각 다른 강조색 배지·버튼 병치.

**P3. 컨트롤 경계는 하나의 관례 (One boundary language)**
- 사용자 이득: 입력 가능 영역이 즉시 구분된다.
- 함의: 모든 컨트롤(Input·Textarea·Select·SearchableSelect 트리거·InputGroup)은 `border-0` + `shadow-control-boundary`(inset 1px `--border-strong`) + `focus-visible:ring-2 ring-ring`. 실선 border 컨트롤은 허용하지 않는다(현행 InputGroup 예외 제거, D-05).
- 실수: `ring-ring/40`·`ring-ring/50` 투명도 변형(현행 14+ 파일, D-01), border와 inset shadow 혼용.

**P4. 텍스트는 크기 계층으로 위계를 만든다 (Hierarchy by scale, not color)**
- 사용자 이득: 저대비 스크린·소형 뷰포트에서도 스캔 순서가 유지된다.
- 함의: 2차 정보는 `text-muted-foreground` + **축소가 아닌 weight/크기 계층**로. 신규 11px(`text-2xs`) 일반 UI 텍스트 금지(§5.3 정책). 위계가 필요하면 `text-sm → text-base` 단계 이동이지 색 명도 저하가 아니다.
- 실수: 11px + muted 조합으로 "시각적 삭제" 대신 사용(현행 랜딩 프리뷰·푸터, D-02).

**P5. 브랜드는 표면과 문구로, 장식으로가 아니라 (Brand in surfaces, not ornament)**
- 사용자 이득: 아이덴티지 인지는 유지되면서 정보 밀도가 보존된다.
- 함의: 핑크는 표면(tint `bg-primary/10`)·CTA 채움·강조 텍스트(`text-primary-text`)에만. 새 그라디언트·글로우·blur 장식 금지(antislop 계약 승계). Discord 브랜드색(`#5865f2` 등)는 Discord 목업 프레임 내부 전용.
- 실수: `--brand`를 배경·장식·아이콘 전반에 확산.

**P6. 동작은 상태 변화만 알린다 (Motion explains change)**
- 함의: duration은 항상 토큰(`--motion-fast/base/slow`·framer는 근사치 매핑 §7.4). 무한 루프는 콘텐츠 상태 표시(재생 중·연결 중)에 한정하고 사유 주석을 동반(현행 계약 승계).
- 실수: framer 인라인 `duration: 0.25` 등 토큰 미참조 값 산발(현행 29곳, D-06).

**P7. 한국어 문구는 상태와 원인을 정확히 (Korean copy states facts)**
- 함의: 모든 상태 문구는 (원인) + (다음 행동) 구조. 진행형 문구는 실제 진행 중일 때만. 경어체 유지.
- 실수: 영구 빈 상태에 진행형(현행 `/track`), "오류" 원인 불명 문구.

## 2. 목표·비목표

### 목표 (Phase 3 구현 범위)
1. 상태 표현 체계 통합(loading/empty/error 4-레이어) 및 문구 정합성 수정.
2. 포커스 링·z-index의 토큰화·표준화.
3. InputGroup 경계 관례 통일(실선 → inset).
4. 마이크로 타입(11px) 정책 시행 — 일반 UI 12px 하한.
5. Button 체계 밖 자체 컨트롤 흡수(guild-card·FavoriteButton·TrackListenLink·web-player clear).
6. framer-motion 인라인 duration의 토큰 매핑.
7. 죽은 토큰·문서-코드 불일치 정리.
8. `/track` 빈 상태 문구·레이아웃, 랜딩 히어로 상단 리듬 정돈.
9. next/image `sizes` 부여.

### 비목표 (Phase 3에서 금지 — 근거 없이는 변경 금지)
- 팔레트·브랜드 색상 값 변경(현행 AA 통과, DESIGN.current.md §3-5).
- Pretendard 폰트 교체, 새 폰트/아이콘 라이브러리 도입(lucide 단일 소스 유지).
- shadcn/base-ui 아키텍처 교체, 새 컴포넌트 라이브러리·애니메이션 패키지 설치.
- 라우팅 구조·인증 흐름·API·데이터 로직 변경.
- 다크 기본·next-themes 방식 변경(라이트/다크 이원화 유지).
- floating save-bar 동작 변경(루트 DESIGN.md v1 §승인된 개선 방향 + `apps/dashboard/DESIGN.md` §8의 상태 계약이 이미 확정 문서).
- Discord 목업군(`discord-*` 팔레트) 재디자인 — 실제 Discord 재현이 목적.
- 랜딩 섹션 구조 재편(hero/features/commands/invite 순서·콘텐츠 유지).
- 무한 루프 장식의 신규 추가(사유 기록 장치는 유지).

### 기능적 비변경 계약
- 모든 인터랙션 동작(⌘K 팔레트·테마 토글·모바일 탭바 제스처·드래그 순서 변경·virtualizer·폴링)은 시각만 정돈하고 행동을 바꾸지 않는다.
- `keepMounted` 탭 패널·초안(draft) 보존·`hasUnsavedSettings()` 경고 체계 유지.

## 3. 디자인 시스템 아키텍처 (변경 없음, 준수 계약)

| 관심 | 파일 | 계약 |
| --- | --- | --- |
| 토큰 정의(단일 소스) | `apps/dashboard/src/app/globals.css` | 9섹션 순서 유지. `@theme inline` 필수(다크 오버라이드 메커니즘). 신규 토큰도 이 파일에만. |
| cn | `apps/dashboard/src/lib/utils.ts` | tailwind-merge 커스텀 그룹 유지, 신규 유틸리티 등록 시 갱신. |
| 테마 | `apps/dashboard/src/components/Providers.tsx` | next-themes `attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`. 컴포넌트 `dark:` 분기 금지(원시 status색 예외 승계). |
| 공용 프리미티브 | `src/components/ui/*`, `src/components/primitives/*` | cva 단일 정의. `ui/*` shadcn 파일 통째 교체 금지, className 오버라이드로 cva 죽이기 금지(기존 계약). |
| 토큰 소비 규칙 | — | `--brand` 소스 전용 / 강조 텍스트 `text-primary-text` / CTA `bg-primary-control`+`text-primary-control-text` / 중립 hover `bg-secondary → hover:bg-surface-3` / 서피스 슬롯은 `--surface-*` 원본만 수정. |

현행 구조는 유지 가능한 상태다(DESIGN.current.md §2). Phase 3는 이 구조 안에서 토큰 추가·소비처 정규화만 한다.

## 4. 컬러 시스템

### 4.1 의미 토큰 (전 수치 확정 — 변경 없음, 신규 2종 추가)

정의 위치: `globals.css` `:root`(라이트)/`.dark`(다크). 대비 산술 근거: `apps/dashboard/scripts/wcag-contrast-audit.py` 통과 기록 + 독립 계산(DESIGN.current.md §3-5).

| 토큰 | 다크 | 라이트 | 용도 | 대비(다크, 대 background/surface-1) |
| --- | --- | --- | --- | --- |
| `--background` | `#1f1618` | `#fff9f9` | 페이지 기저 | — |
| `--foreground` | `#fbeeee` | `#3a2c30` | 본문·제목 | 13.7:1 |
| `--surface-1` | `#2b2023` | `#ffffff` | 카드·팝오버 원면(`--card`·`--popover` 별칭) | — |
| `--surface-2` | `#3a2c30` | `#fff0f0` | 중첩/inset 영역(`--secondary`·`--muted` 별칭) | — |
| `--surface-3` | `#3a2c30` | `#ffffff` | 중립 컨트롤 hover 단계·플로팅 오버레이 | — |
| `--primary` | `#ffdada` | `#ffdada` | 브랜드 **표면**(tint 전용, 텍스트 직접 사용 금지) | — |
| `--primary-foreground` | `#3a1a22` | `#4f1c2a` | `bg-primary` 위 라벨 | 12.06:1 (primary 위) |
| `--brand` | `#f98aa0` | `#ee6f8b` | 소스 전용(ring·control 원본) | — |
| `--primary-control` | `var(--brand)` | 동일 | 솔리드 CTA 채움 | — |
| `--primary-control-hover` | `#f27890` | `#f27c96` | CTA hover | — |
| `--primary-control-text` | `var(--primary-foreground)` | 동일 | CTA 라벨 | 6.79:1 (control 위) |
| `--primary-text` | `#ffdada` | `#4f1c2a` | 중립 서피스 강조 텍스트 | 13.7:1 |
| `--muted-foreground` | `#b9a4a9` | `#7d686d` | 2차 텍스트 | 7.5:1 / 5.65:1 (surface-2 위) |
| `--accent` / `-foreground` | `#4d3b40` / `#ffdada` | `#ffc3c9` / `#4f1c2a` | 메뉴 hover·선택 | — |
| `--border` (`--input` 별칭) | `#4d3b40` | `#f3d3d6` | 구분선·인풋 채움 | — |
| `--border-subtle` | `#3a2c30` | `#f8e1e4` | 헤어라인 구분 | — |
| `--border-strong` | `#a37d89` | `#b4779b` | 컨트롤 inset 경계 | 4.39:1 (non-text 3:1 통과) |
| `--ring` | `var(--brand)` | `#c4476a` | **전 컨트롤 표준 focus ring** | non-text 3:1 통과 |
| `--success` | `#34d399` | `#0f7a52` | 성공(tint `bg-success/10`+`text-success`) | — |
| `--warning` | `#fbbf24` | `#9a6100` | 경고 | — |
| `--destructive` | `#ff7b8a` | `#d4183d` | 오류·파괴 | — |
| `--info` | `#38bdf8` | `#0b6bb0` | 정보(저사용 — 신규 사용은 Badge info tone으로만) | — |
| `--dot-neutral` | `var(--muted-foreground)` | 동일 | 중립 상태점 | — |
| `--rank-1/2/3` | `#f0b232`/`#b9bbbe`/`#cd7f32` | `#b47716`/`#8f8f8f`/`#b0743a` | 차트 랭킹 | — |
| Discord 군 | `--discord-embed/text/text-muted/btn-active/btn-hover/bg` + 고정 `#5865f2`·`#949cf7`·`#23a559` | (각 정의) | Discord 목업 프레임 전용 | 목업 내부 규침 준수 |

### 4.2 신규 토큰 (Phase 3 추가)

| 토큰 | 값 | 목적 | 대체 대상 |
| --- | --- | --- | --- |
| `--z-content` | `10` | 레이아웃 레벨 콘텐츠 레이어(`app/layout.tsx:77` main 래퍼 등). **카드 내부 국소 스택(`relative z-10` 겹침 해소, 28곳)은 로컬 관례로 유지 — 토큰 대상 아님** | `layout.tsx:77` 등 레이아웃 레벨 `z-10` |
| `--z-savebar` | `30` | 설정 저장 바 | `settings-shared.tsx:400` `z-30` |
| `--z-float` | `40` | 플로팅 액션(ScrollToTop) | `scroll-to-top.tsx:32` `z-40` |
| `--z-overlay` | `50` | 모달·드롭다운·시트·모바일 탭바 | shadcn `z-50` 관례 전부 |
| `--z-popover-high` | `60` | 전역 오버레이 위 독립 팝오버 | `mixer-info.tsx:163·169` `z-[190]/z-[200]` |
| `--toast-z` | `100` (존속) | 토스트 | 변경 없음 |

z 체계는 `--z-*` 네임스페이스가 Tailwind v4에 없으므로 `z-(--z-overlay)` 문법으로 소비한다(현행 `--toast-z` 방식 승계, `globals.css:246-248` 주석 참조). `mixer-info`의 임의값 190/200은 토스트(100) 위가 아니라 오버레이(50) 위·토스트 아래의 `--z-popover-high`(60)로 낮춘다 — 팝오버가 토스트를 가리는 것은 결함이므로(F-04).

### 4.3 테마 관계
- `.dark` 클래스의 CSS 변수 재정의만으로 전환(`@theme inline` 계약). 라이트 값은 대비 산출이 이미 검증된 짝(§4.1 표)을 유지 — 신규 색 도입 시 두 테마 값을 함께 정의하고 wcag 스크립트를 실행한다.
- **상태색 사용 규칙**: 성공·정보는 tint(`bg-{tone}/10` + `text-{tone}`). 경고·파괴만 솔리드 배지 허용(Badge AA 사유 주석 승계). 텍스트 안내 병행(P5).

### 4.4 대비 요건
- 본문 4.5:1, 큰 텍스트(18.66px bold+) 3:1, non-text 경계 3:1(SC 1.4.11).
- 변경 후 `python3 apps/dashboard/scripts/wcag-contrast-audit.py` → `Unexpected failures: 0` 필수.
- 기대 expected-fail군(fill 단독 secondary, switch thumb 등)은 스크립트 문서화 목록 승계 — 새 expected-fail 추가 금지.

## 5. 타이포그래피

### 5.1 폰트 스택 (변경 없음)
`--font-sans` = Pretendard Variable → Pretendard JP Variable → Twemoji Mozilla → Apple/Segoe/Noto emoji → system. next/font local 유지(Pretendard JP preload:false 계약 승계).

### 5.2 타입 스케일 (Tailwind 기본 유지 + 역할 정책)

| 단계 | 크기/행간 | 용도 |
| --- | --- | --- |
| `text-2xs` | 11px/16px | **마이크로 전용** — §5.3 정책 참조 |
| `text-xs` | 12px/16px | 배지·kbd·보조 라벨·메타데이터 하한 |
| `text-sm` | 14px/20px | 본문 기본·컨트롤 라벨·폼 텍스트 |
| `text-base` | 16px/24px | 강조 본문·모바일 입력값(16px 계약) |
| `text-lg`/`text-xl` | 18/20px | 카드 수치·섹션 부제 |
| `text-2xl` | 24px/32px | 카드·모달 제목 |
| `text-3xl→5xl` | 30/36/48px | PageHeader H1 (`text-3xl sm:text-4xl lg:text-5xl font-black tracking-tighter`) |
| `text-4xl→6xl` | 36/48/60px | 랜딩 히어로 H1 (`text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter`) |

- 제목 계층: PageHeader가 페이지 유일 H1. 카드 제목 `text-2xl font-black` 또는 `text-base/lg font-bold` — 섹션 사이에 H2 누락은 허용하나 H1→H3 점프(track.tsx:224)는 유지보수 시 H2로 정정 가능(선택).
- 수치: `font-black tabular-nums`(StatCard·랭킹·통계 계약 승계).
- 모바일 입력값 16px(iOS 줌 방지 — 루트 v1 계약 승계, `SearchInput`의 `text-base sm:text-lg`는 유지).

### 5.3 마이크로 텍스트 정책 (신규 — D-02)
- `text-2xs`(11px)의 허용 영역: (a) Discord 목업 프레임 내부(실제 Discord 밀도 재현), (b) kbd 키캡(navbar ⌘K), (c) 8px 워터마크(`text-3xs`는 mock-thumbnail 1곳 승계).
- **일반 UI(푸터 그룹 제목·통계 라벨·폼 메타·상태 문구)의 신규 11px 금지 — 하한 `text-xs`(12px)**. 현행 위반 후보: `footer.tsx:70` 그룹 제목(`text-2xs md:text-xs` → `text-xs`), `track/page.tsx:71·82` 통계 라벨(`text-2xs sm:text-xs` → `text-xs`).
- 2차 텍스트의 "축소 + muted" 이중 약화 금지(P4): 한 요소에 `text-2xs/3xs`와 `text-muted-foreground` 조합은 Discord 목업·kbd 외 금지.

## 6. 간격·레이아웃

### 6.1 간격 척도
Tailwind 기본 4px 스텝 유지(별도 척도 토큰 도입 안 함 — §12 D-09 기각 사유 참조). 역할 규칙:

| 역할 | 값 | 근거 |
| --- | --- | --- |
| 컨트롤 내부 패딩 | Button/입력 `px-3/4`(size별 cva) | 현행 cva 승계 |
| 카드 내부 | `p-5`(Card md)·중첩 노드 `p-4` | A-04 통일: data-api·voice-server의 `p-3` → `p-4` |
| 관련 요소 gap | `gap-2/3` | 현행 관례 |
| 그룹 간 gap | `gap-4/6` | 현행 관례 |
| 섹션 간(앱 페이지) | `space-y-6` | `track/page.tsx:94` 기준 |
| 섹션 간(랜딩) | `py-14 sm:py-20 lg:py-24` | 홈 3섹션 공통 관례 승계 |
| 페이지 하단 | `pb-16`(Container) | 현행 승계 |
| safe-area | `pb-[calc(5.25rem+env(safe-area-inset-bottom))]`(layout 본문) | 모바일 탭바 클리어런스 승계 |

### 6.2 컨테이너·콘텐츠 폭
- `Container` = `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8` + `min-h-[calc(100svh-var(--navbar-h))]` (단일 산식, 5곳 중복은 `--hero-scroll-hint-gap`류 개별 산식과 함께 §12에서 "산식 상수"로 정리).
- 하위 폭: 섹션 헤더 `max-w-2xl`, 초점형 `max-w-xl`, 다이얼로그 `max-w-6xl`(편집기 예외 승계), SaveBar 아일랜드 `max-w-[760px]`(§8 승계).

### 6.3 헤더·사이드바
- Navbar: `sticky top-0 z-(--z-overlay)`, 높이 `--navbar-h`(4rem=64px). 우측 클러스터 h-11(44px) 세그먼트 유지.
- 사이드바(도메인별, 공용 Sidebar 없음 — 계약 승계): lg+ `Card padding="none"` + 항목 `rounded-menu px-3 py-2.5`; 폭은 도메인별(플레이리스트·서버 기능) 유지.

### 6.4 컨트롤 높이 체계 (A-05 통일)

| 토큰급 값 | Button size | 사용처 |
| --- | --- | --- |
| h-6 (24px) | `xs` | 인라인 칩 액션 |
| h-8 (32px) | `sm` | 툴바·밀집 영역 |
| h-9 (36px) | `default`/`md` | **표준 컨트롤** — Input(h-9)·Select default(h-9)와 정렬 |
| h-10 (40px) | `lg` | 대형 폼 CTA |
| h-11 (44px) | (size 아님 — 클래스 오버라이드 금지) | **터치/헤더 표준** — navbar 세그먼트·guild-card 주 액션·히어로 CTA. **신규: Button size `xl` 추가(§8.1)** |
| h-12 (48px) | (guild-card md 전용 → `xl`이 h-11로 수렴) | guild-card md 오버라이드 제거(D-04) |

- SearchInput `h-12 sm:h-14`는 랜딩/차트 히어로 검색 전용 예외로 승계(문서화).

### 6.5 z-index 체계 (D-01·F-04 해결)
§4.2의 `--z-*` 6종이 전부. 새 리터럴 z 값 금지. 오버레이 내부 상대 순서는 DOM 순서로.

## 7. 모양·경계·그림자·모션

### 7.1 Radius (변경 없음 — 승계)
`--r-control` 0.625rem / `--r-control-inner` 0.375rem / `--r-menu` 0.75rem / `--r-card`·`--r-dialog` 1rem. `rounded-full` = 배지·칩·상태점·약알만. `rounded-sm/md/lg` 레거시: 소비처는 유지하되 신규 사용 금지(현행 계약 승계). **메뉴·팝오버 항목의 `rounded-md`는 항목 단위 관례로 잔여 허용**(dropdown-menu·searchable-select·tabs 내부 — 컨테이너가 `rounded-menu`이므로 위계가 성립; Skeleton.Line의 `rounded-md`는 `rounded-control-inner`로 대체(D-10, 선택).

### 7.2 경계
- 컨트롤: `border-0` + `shadow-control-boundary`(P3). InputGroup 예외 제거(D-05).
- 카드: `border-0` + `shadow-sm`(elev-1).
- 헤어라인 구분: `gap-px bg-border-subtle`(명령어 메뉴판) 또는 `border-border-subtle`.
- 인접 컨텐츠 구분이 경계를 필요로 할 때: `border-t border-border-subtle`(Footer 계약 승계).

### 7.3 Elevation (변경 없음)
`shadow-sm/md/lg/2xl` = `--elev-1/2/3/5`. 용도: sm=카드 헤어라인 / md=휴식 카드(저사용·유지) / lg=플로팅 바·모바일 탭바 / 2xl=메뉴·모달. shadow는 elevation 전용(장식 금지).

### 7.4 모션
- duration: `--motion-fast/base/slow` = 200/300/500ms. CSS는 유틸리티(`duration-fast/base/slow`, `transition-control`).
- **framer-motion 매핑 (신규, D-06)**: JS 전달값은 초 단위이므로 상수 모듈 `src/components/motion/durations.ts`(제안 위치)에서 `export const motionFast = 0.2` / `motionBase = 0.3` / `motionSlow = 0.5` + `export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1]` 를 내보내 인라인 리터럴을 대체한다. 현행 인라인 값 군(0.15/0.18/0.2/0.25/0.3/0.35/0.4/0.5/0.6/0.8)은 근사 계층으로 스냅: ≤0.22→`motionFast`·0.23~0.4→`motionBase`(0.35→`motionBase`가 시각적으로 50ms 느려지므로 **0.25/0.3만 스냅, 0.35/0.4는 `motionBase`와 새 350ms 계층 논의 없이 `motionBase`로**)/≥0.45→`motionSlow`. 0.6/0.8은 장식용 감속 — 개별 사유 주석 없이 `motionSlow`로.
- easing: `--ease-out-expo`. spring 파라미터(stiffness/damping)는 자유 유지(감쇠 특성상 토큰화 부적합 — D-06 범위 밖).
- 무한 루프: 재생 중·연결 중 등 콘텐츠 상태 + `animate-pulse-soft`·ShapeBand 등 기록된 예외군만(R-19 계약 승계). reduced-motion 전역 무효화 블록 + `MotionConfig reducedMotion="user"` 승계.

## 8. 컴포넌트 사양

공통: 모든 컨트롤 `focus-visible:ring-2 ring-ring`·`transition-control duration-fast`·`disabled:opacity-50`·`rounded-control`. 상태 미기술 시 현행 cva 승계.

### 8.1 Button (`src/components/ui/button.tsx` + `button-variants.ts`)
- **variants 11종 유지** + alias 계약(default≡primary, danger≡destructive) 주석 승계.
- **신규 size `xl`** — `h-11 px-5 text-sm font-bold`: 터치/헤더 액션 표준. `guild-card.tsx`의 h-11/md:h-12 오버라이드 3곳·`hero-section.tsx`의 `size:lg`+`h-11` 오버라이드를 이 size로 대체(D-04).
- **variant 정리**: `icon` variant는 유지하되 `variant="icon"` + size(`icon-xs/sm/-/lg`)의 산발 대신 **`size`가 아이콘 크기를 결정**하는 현행 compound 계약 승계.
- 로딩: `loading` prop(Loader2로 children 대체, disabled 병행) — 신규 컴포넌트별 spinner 금지(P1).
- FavoriteButton(`track.tsx:156`): `variant="icon"` + `size` 반응(h-8 sm:h-10 → `size="sm"` + `sm:size`는 cva 밖이므로 **`size="icon-sm"` 데스크톱 전환은 구현 시 클릭 영역 유지 검증 후 결정**, 우선 `icon-sm` 단일화 제안)·active 상태 = `data-active` + 하트 fill 색상만 클래스 오버라이드 허용(상태색이라 cva 밖 가치).
- 웹 플레이어 검색어 지우기(`web-player-section.tsx:317`): `SearchInput`의 `Button ghost` 청소 버튼과 동일 구현으로 통일(D-07).

### 8.2 Input / Textarea / InputGroup / Select / SearchableSelect
- Input·Textarea: `h-9 bg-input border-0 shadow-control-boundary`, focus `ring-2 ring-ring`, `aria-invalid` → `shadow-control-boundary-invalid` + `ring-destructive`(승계).
- **InputGroup(D-05)**: `border border-input` → `border-0` + `shadow-control-boundary`로 Input과 동일 관례. 내부 focus-within ring은 유지하되 `ring-ring/50` → `ring-ring`(P3). `rounded-control-inner` 소비(addon·kbd) 승계.
- Select: Trigger h-9/sm h-7 승계. 팝업 `rounded-menu bg-popover shadow-2xl p-1`.
- SearchableSelect: 트리거 `min-h-9 rounded-control bg-input shadow-control-boundary`, 팝업 `rounded-menu shadow-2xl`, 항목 `rounded-md`(메뉴 항목 관례 허용 §7.1), 빈 결과 텍스트는 §8.10 문구 계약 준수.

### 8.3 Card (`src/components/ui/card.tsx`)
variant default/muted/raised/interactive·padding none/sm/md(p-5)/lg(p-6) 승계. 중첩 규칙: 카드 안 카드 금지 — 중첩 노드는 `rounded-control bg-surface-2 p-4`(A-04: p-3 → p-4 통일).

### 8.4 Badge / StatusDot
- Badge tone 12종 + dot 12종 승계. warning·danger·discord 솔리드(AA 주석 승계). `info` tone 유지.
- StatusDot: status 5종·size 3종·pulse 정책(과도 상태만) 승계. tone은 Badge 재사용 유지.

### 8.5 Tabs / Dialog / Sheet / DropdownMenu / Command / Toast
- Tabs: list variant `line`(기본)/`default` 승계, 활성 하단선 `bg-primary-control`.
- Dialog/Sheet: overlay `bg-black/60 backdrop-blur-sm`(블러+opacity 동시 금지 주석 승계)·content `rounded-dialog bg-popover p-4 shadow-2xl`·Footer `-mx-4 -mb-4 bg-muted/50 rounded-b-dialog`(승계).
- DropdownMenu: 항목 `rounded-md`·focus `ring-2 ring-ring`(비일관성 아님, §7.1).
- Toast: `z-(--toast-z)` 승계. variant 4종 + 아이콘 칩 `bg-{tone}/10`.
- Command(⌘K): `rounded-dialog bg-popover`, 유일 소비처 계약 승계.

### 8.6 Field / Label / Switch / Slider / ColorPicker / Avatar / Skeleton
- Field: label/description/`role="alert"` error·render-prop id 연동 승계.
- Switch: sm 36×20 / md 44×24, thumb 고정 백, off `bg-secondary`+boundary / on `bg-primary-control`(승계).
- Skeleton: `SkeletonCard` role="status", `SkeletonLine rounded-md` → `rounded-control-inner` 권장(D-10, 선택).
- Avatar sizes xs/sm/md/lg·status ring 계약 승계.

### 8.7 EmptyState / ErrorPanel (P1 체계 — D-03)
- **EmptyState 확장**: props에 `tone?: "default" | "warning" | "destructive"` 추가(제안). tone은 아이콘 칩 배경만 변경(`bg-{tone}/10`), 문구·구조 동일. ErrorPanel은 유지하되 **내부 구현을 EmptyState tone="destructive" 위임으로 재작성**(형태 언어 동일 주석 승계 → 코드 통합, props `title/message/onRetry` API 유지).
- **문구 계약(P7)**: loading 문구는 진행형("불러오는 중…"), empty 문구는 원인+다음행동("아직 기록이 없어요. 디스코드에서 가위바위보로 시작해 보세요." — 현행 좋은 사례 승계), error 문구는 원인+재시도.
- **플레인 텍스트 빈 상태 정리(D-03)**: `searchable-select.tsx:219`·`playlist-sidebar.tsx:106`·`profile-view.tsx`(인라인 `<p>`)는 EmptyState `size="sm"`로 대체. 문구는 기존 유지.
- **`/track` 빈 상태(D-08)**: `!query && tracks.length===0` → "아직 차트 데이터가 없어요. 노래를 재생하면 순위가 집계돼요."(진행형 제거) + description 유지. `query && length===0` → "노래를 찾을 수 없어요." 승계.

### 8.8 로딩 체계 (P1 — A-02/D-01 해소)
| 상황 | 표현 | 근거 |
| --- | --- | --- |
| 페이지 최초 진입(라우트 전환) | 구조 동형 Skeleton(`loading.tsx`) — shards·profile·contributors·servers/[id] 관례 승계 | 구조 예측 가능 |
| 도메인 전환(플레이리스트·플레이어) | 현행 `Loader fullPage`는 **유지**(스켈레톤 동형화는 인증 화면 실측 후 Phase 3 선택 과제) | 검증 부재(§13 D-11) |
| 범위 한정 갱신(검색·버튼 제출) | 인라인 Loader2/Button `loading` | 스크린 리더 스팸 방지 |
| 목록 내 항목 갱신 | 기존 데이터 유지 + Badge("동기화 실패") — shards 폴링 관례 승계 | 현행 좋은 사례 |

### 8.9 GuildCard / ServerSwitcher / 설정 공용군
- GuildCard: 링크 3종의 variant 오버라이드 → `variant="primary" size="xl"`(D-04) + `bg-primary/10` 등 채움만 남기고 나머지 제거. 미설치 초대 CTA·설치 배지(`ShieldCheck`)·`isManageable` 분기 동작 전부 유지.
- ServerSwitcher: Popover/Sheet 3중 구조·미설치 길드 초대 CTA 승계. 스켈레톤 `servers/[id]/loading.tsx`는 PageHeader 오버라이드(`!mb-2 !pb-2`) 재현 유지.
- SaveBar: `bg-surface-3 rounded-card shadow-lg z-(--z-savebar)` + `apps/dashboard/DESIGN.md` §8 상태 계약 전부 승계(범위 밖).

### 8.10 상태 표현 4-레이어 (P1 요약)
1. **Skeleton** — 구조 동형, 라우트 loading.
2. **Loader**(스핀) — 범위 한정 진행. `Loader text="…"` 문구는 진행형.
3. **EmptyState** — 원인 + 다음 행동. tone 확장(§8.7).
4. **ErrorPanel** — 원인 + 재시도. EmptyState destructive 위임.

## 9. 애플리케이션 레이아웃

### 9.1 셸 (변경 없음 — 승계)
`layout.tsx`: BackgroundShapes → Navbar(sticky, `z-(--z-overlay)`) → main(flex-1 z-10) → Footer → ScrollToTop(`z-(--z-float)`) → GlobalCommandPalette. 본문 래퍼 `min-h-svh pb-[calc(5.25rem+safe-area)] md:pb-0`. `template.tsx` PageTransition(`animate-page-in`) 승계.

### 9.2 내비게이션
- 데스크톱 링크 row(md+): `rounded-menu px-3.5 py-2 text-sm font-medium`, 활성 `text-primary-text` + 인디케이터 `bg-primary-control/10`(spring 400/30 승계). **신규: 링크에 `focus-visible:ring-2 ring-ring` 추가**(현행 부재 — D-12, 브라우저 기본 outline만으로는 제품 링과 불일치).
- 우측 세그먼트(palette+theme) h-11 승계. CTA `시작하기` = `variant="secondary" size="xl"`(h-11 오버라이드 제거).
- 모바일 탭바: `md:hidden`·알약 `bg-background/60 backdrop-blur-xl`·항목 `min-h-12`(50px 실측)·`z-(--z-overlay)`·드래그 제스처 + 클릭 가드 전부 승계.

### 9.3 페이지 구조 (라우트 매핑)
| 레이아웃 | 라우트 | 골격 | Phase 3 변경 |
| --- | --- | --- | --- |
| 랜딩 | `/` | hero(2열 lg+) → features(지그재그) → commands(메뉴판) → invite ticket | 히어로 pt 축소(§9.4), 프리뷰 라벨 행 정렬(D-13) |
| 초점형 | `/login`·`/invite`·`/error`·`404` | FocusPageShell(중앙, 32rem 앰비언트) | 없음(정합성 확인 결과 양호) |
| 데이터 목록 | `/track`·`/contributors`·`/licenses` | PageHeader + 카드/목록 | track 통계 라벨 12px(D-02)·빈 상태 문구(D-08)·통계 박스 구분선 `divide-border-subtle`(B-01, 선택) |
| 운영 | `/shards` | StatCard 4열 + 섹션 카드 | 중첩 p-4 통일(A-04) |
| 도메인(인증) | `/servers/[id]`·`/playlists`·`/player/[id]`·`/profile` | Container + PageHeader + 도메인 모듈 | **소스 기반 사양만** — 실측 후 보강(§13 D-11) |
| 갤러리 | `/design` | 자체 헤더 + sticky TOC | 없음 |

### 9.4 히어로 리듬 (C-01·A-01)
- 현행: `pt-8 sm:pt-16 lg:pt-20` + `content-center` + `min-h-[calc(100svh-var(--navbar-h))]` → GNB→H1 첫 잉크까지 65px(768)·약 180px(1440)로 "상단 공백 과대" 관찰 반복.
- **목표**: `pt-4 sm:pt-8 lg:pt-10`으로 축소(2단계 하향). `content-center` 유지(세로 중심 계약) — 축소분은 하단 pb가 흡수. 수용 기준: 1440에서 GNB 하단→H1 상단 잉크 거리 ≤ 120px, 768에서 ≤ 48px.
- 프리뷰 라벨 행(A-01): 라벨+탭 행은 카드 외부 구조 유지하되 `sm:items-center` 상태에서 라벨 baseline을 탭 행과 정렬(`items-end`→`items-center` 검토) — 스크린샷 상 '돌출'은 라벨 행이 카드보다 위에 있어서 발생하므로 **구조 유지 + 간격 `gap-3` → `gap-4` 증가만으로 시각적 분리 명확화**(구조 변경 최소).

### 9.5 next/image (D-14)
`navbar.tsx:112` `fill` Image에 `sizes="32px"` 추가(32×32 컨테이너). 동일 패턴 전수 확인 후 일괄.

## 10. 반응형 디자인

### 10.1 브레이크포인트 전략 (변경 없음)
Tailwind 기본 sm 640 / md 768 / lg 1024. 대표 검증 뷰포트: 1440 / 768 / 390(+수용 기준 산출 시 320·200% 줌).

### 10.2 전환 규칙 (실측 승계 + 계약)
- 1440: 히어로 2열(`lg:grid-cols-[minmax(0,0.9fr)_auto]`), 도메인 사이드바 `hidden lg:block`.
- 1024 미만(태블릿 768): 히어로 단일 열 중앙 정렬(`items-center text-center`), 도메인 탭 스트립(`lg:hidden`), 모바일 탭바는 md까지 표시.
- 768 미만(모바일 390): 데스크톱 nav row `hidden`(미터치 0 실측), 하단 플로팅 탭바, 본문 safe-area 패딩. 랜딩 CTA 세로 스택(`w-full sm:w-auto` 승계).
- 그리드: contributors `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, profile/ProcessCard `md:grid-cols-2` 승계.
- 오버플로우: 전 라우트×3 뷰포트 0건 실측(DESIGN.current.md §10) — 회귀 기준으로 승계. 허용된 국소 스크롤(탭 스트립·테이블)은 `scrollbar-none` 관례 유지.

### 10.3 터치 타깃
모든 인터랙티브 ≥44×44px(모바일 탭바 50px 실측·guild-card h-11·세그먼트 h-11 승계). 신규 컨트롤 `size="xl"`(h-11)이 터치 표준.

## 11. 인터랙션·접근성

### 11.1 키보드·포커스
- **표준**: `focus-visible:ring-2 ring-ring`(2px, 불투명). `/40`·`/50` 투명도 변형 전부 제거(D-01 — 14+1 파일). focus 스타일이 없는 nav 링크·탭바 링크에 추가(D-12).
- 첫 Tab 착지: 현행 실측이 우상단 CTA였으나 DOM 순서상 로고가 선행 — **가설**로 기록, Phase 3에서 `Tab` 1회→로고 링크인지 확인 후 이상 시 `tabindex` 정돈(§13 U-1).
- ⌘K·Escape·드래그 가드 동작 승계.

### 11.2 대비
§4.4 계약. 마이크로 텍스트는 §5.3 정책으로 해소(토큰 산술은 이미 AA — 색이 아니라 크기·조합 정책).

### 11.3 WCAG 2.2 AA 타깃
- 1.4.3/1.4.11 대비: wcag 스크립트 `Unexpected failures: 0`으로 유지 검증.
- 2.4.7 포커스: ring 표준화 후 전 컨트롤 가시 확인(수용 기준 §14).
- 2.5.8 타깃: ≥24px 최소(AA)·제품 표준 44px(§10.3).
- **미해결 질문(U-2)**: 정식 axe·스크린리더·200% 줌·소프트키보드 검증 미실행(DESIGN.current.md §14 승계) — Phase 3 수용 기준에 포함하나 compliance 주장은 금지.

### 11.4 피드백
- 저장: SaveBar 상태 계약 승계(`apps/dashboard/DESIGN.md` §8).
- 파괴: Confirm 모달 관례 승계.
- toast: 상단 뷰포트·`z-(--toast-z)`(스크린리더 중복 방지 계약 승계).

## 12. 구현 매핑

우선순위 순. 각 항목: 위치(확인됨) / 변경 유형(추가·교체·통합·정리).

| # | 작업 | 소스 위치(확인) | 유형 | 의사결정 |
| --- | --- | --- | --- | --- |
| 1 | z 토큰 5종 추가(`--z-content/savebar/float/overlay/popover-high`) | `globals.css` §6(246-251 부근) | 추가 | D-01 |
| 2 | z 소비처 전환: `z-50`→`z-(--z-overlay)`(dialog·sheet·dropdown·select·command·mobile-tab-bar·server-switcher), `z-30`→savebar, `z-40`→float, `mixer-info.tsx:163·169` `z-[190]/[200]`→`z-(--z-popover-high)` | 각 파일 | 교체 | D-01·F-04 |
| 3 | ring 표준화: `ring-ring/40`(14 파일)·`ring-ring/50`(input-group)→`ring-ring` | `server-feature-sidebar.tsx:50`·`track.tsx:161`·`scroll-to-top.tsx:32`·`searchable-select.tsx:180` 등 | 교체 | D-01 |
| 4 | InputGroup border→inset: `border border-input`→`border-0 shadow-control-boundary` | `ui/input-group.tsx:17` | 교체 | D-05 |
| 5 | Button size `xl`(h-11) 추가 + guild-card 오버라이드 제거·hero CTA 정규화 | `ui/button-variants.ts:44-54`·`servers/guild-card.tsx:55-90`·`home/hero-section.tsx:208-212` | 추가+교체 | D-04 |
| 6 | EmptyState `tone` prop 추가 + ErrorPanel EmptyState 위임 재작성 | `primitives/empty-state.tsx`·`error-panel.tsx` | 추가+통합 | D-03 |
| 7 | 플레인 빈 상태 → EmptyState sm: `searchable-select.tsx:219`·`playlist-sidebar.tsx:106-109`·`profile-view.tsx:171·252` | 각 파일 | 통합 | D-03 |
| 8 | `/track` 빈 상태 문구 교체(진행형 제거) | `app/track/page.tsx:98-104` | 교체 | D-08 |
| 9 | 마이크로 텍스트 12px 하한: `footer.tsx:70`·`track/page.tsx:71·82` (+전수 재확인) | 각 파일 | 교체 | D-02 |
| 10 | motion 상수 모듈 + framer 인라인 duration 교체(29곡) | 신규 `src/components/motion/durations.ts`(제안) + `hero-section.tsx`·`features-section.tsx`·`reveal.tsx`·`previews/*` 등 | 추가+교체 | D-06 |
| 11 | 중첩 노드 p-3→p-4 통일 | `data-api-section.tsx:88`·`voice-server-section.tsx:81` | 통합 | A-04 |
| 12 | 히어로 pt 축소(`pt-4 sm:pt-8 lg:pt-10`) + 프리뷰 간격 gap-3→gap-4 | `home/hero-section.tsx:156·239` | 교체 | D-13 |
| 13 | nav 링크 focus-visible ring 추가 | `navbar.tsx:138`·`mobile-tab-bar.tsx:340` | 추가 | D-12 |
| 14 | next/image sizes | `navbar.tsx:112` 외 전수 | 추가 | D-14 |
| 15 | 죽은 토큰 삭제: `--success-foreground`·`--info-foreground`·`--color-discord-blue`(소비처 0 재확인 후) | `globals.css:161·172-176 부근` | 정리 | D-15 |
| 16 | 문서 동기화: `apps/dashboard/DESIGN.md` marquee 언급 제거·`--z-toast`→`--toast-z` 문법 수정·DataTable/TagInput/NotificationStack 언급 제거, 루트 v1 DESIGN.md의 `bot-ok/bot-warn` 스테일 값 정리 | 두 문서 | 정리 | D-16 |
| 17 | web-player 검색어 지우기 → Button ghost 통일 | `player/web-player-section.tsx:317` | 통합 | D-07 |
| 18 | 검증 후(선택): FavoriteButton size 통일, SkeletonLine radius, track 통계 박스 구분선 | `track.tsx:156`·`ui/skeleton.tsx:20`·`track/page.tsx:69-90` | 선택 | U-3 |

**Phase 3 구현 순서**: 1-4(토큰·전역) → 5-8(프리미티브·상태) → 9-14(페이지·모션) → 15-17(정리) → 18+수용 기준 §14. 각 단계 후 `yarn lint && yarn typecheck` + wcag 스크립트(색 건드린 경우).

## 13. 의사결정 로그

우선순위: **Must**(결함) / **Should**(체계 개선) / **Optional**. 증거: [SRC]=소스, [BR]=브라우저 실측, [SRC+BR]=교차.

### Must
- **D-01 (High)** z-index·focus ring 표준화. 현행: z 리터럴 산발(z-10/30/40/50/100/[190]/[200]), ring 알파 3종(21+14+1파일). 근거: [SRC] 전수 grep — mixer-info z-200이 토스트(100)를 가림. 이득: 키보드·오버레이 충돌 소멸, 상태 가시성. 리스크: 낮음(클래스 교체 기계적). 신뢰도: 높음.
- **D-08 (High)** `/track` 영구 빈 상태의 진행형 문구. 현행: `!loading && empty`에서 "차트 데이터를 모으고 있어요...". 근거: [SRC] `track/page.tsx:98-104`. 이득: 상태 오독 소멸(P7). 리스크: 없음. 신뢰도: 확정.
- **D-05 (Medium)** InputGroup 실선 border. 현행: Input(border-0+inset)과 이원화. 근거: [SRC] `input-group.tsx:17`. 이득: 경계 언어 단일(P3). 리스크: InputGroup 시각 변화 — 유일 소비처 command.tsx가 이미 `border-0! shadow-none!` 오버라이드 중이므로 영향 최소. 신뢰도: 높음.
- **D-08 파생: 청소 버튼 불일치(D-07)** web-player raw `<button>` vs SearchInput Button ghost. 근거: [SRC] 양 파일. 리스크: 없음.

### Should
- **D-02 (High)** 마이크로 텍스트 정책. 현행: 11px 91곳(랜딩 프리뷰·푸터·통계 라벨). 근거: [SRC+BR] — muted AA 통과에도 11px 조합에서 "묻힘" 반복 관찰(DESIGN.current.md E-01). 이득: 체감 가독성. 리스크: 랜딩 밀도 변화 — Discord 목업 내부는 예외로 보존. 신뢰도: 높음(정책), 관찰 기반(체감).
- **D-03 (Medium)** 상태 체계 통합. 현행: 플레인 텍스트 빈 상태 3+곳, EmptyState에 error 톤 부재. 근거: [SRC]. 이득: P1 확립. 리스크: ErrorPanel 재작성 범위 — props API 유지로 최소화. 신뢰도: 높음.
- **D-04 (Medium)** Button 밖 자체 컨트롤 흡수. 현행: guild-card 3링크 각기 다른 오버라이드·hero `size:lg`+h-11. 근거: [SRC]. 이득: 높이 체계 단일(§6.4). 리스크: guild-card 비주얼 미세 변화(h-12→h-11 md) — 클릭 영역 44px 유지되므로 수용. 신뢰도: 높음.
- **D-06 (Medium)** framer duration 토큰화. 현행: 인라인 29곳, token 준수 1파일. 근거: [SRC]. 이득: P6 확립. 리스크: 50ms급 시각 차이. 신뢰도: 높음.
- **D-12·D-13·D-14 (Medium)** nav 링크 focus ring·히어로 리듬·image sizes. 근거: [SRC]/[BR]/[BR]. 리스크: 낮음.
- **D-15·D-16 (Low)** 죽은 토큰·문서 동기화. 근거: [SRC] 재검증(DESIGN.current.md 부기 참조). 리스크: 삭제 전 소비처 재확인 필수.

### Optional
- **D-10** SkeletonLine radius, **D-11** 도메인 로딩 Loader→Skeleton 동형화(인증 실측 전 보류), **B-01** track 통계 박스 구분선, **D-09** 간격 척도 토큰 도입(기각 — Tailwind 스텝+역할 규칙이면 충분, 토큰 중복만 유발).

### 미해결·가설 (Phase 3에서 확인)
- **U-1** 첫 Tab 착지 요소(§11.1) — 현행 실측(CTA)과 DOM 순서(로고) 불일치. 가설로 기록, 확인 후 필요 시 수정. 신뢰도: 낮음(측정 환경 영향 가능).
- **U-2** 정식 접근성 검증(axe·스크린리더·200%·소프트키보드) 미실행 — Phase 3 수용 기준에 포함.
- **U-3** FavoriteButton size·SkeletonLine radius·통계 박스 — 구현 중 검증 후 선택.
- **D-11 전제**: 인증 도메인 4라우트(`/servers/[id]`·`/playlists`·`/player/[id]`·`/profile`)는 소스 기반 사양만 존재. Phase 3 시작 전 OAuth 테스트 세션으로 실측 감사 선행 권장(DESIGN.current.md §15-1 승계). 이 문서의 도메인 규격(§9.3)은 소스 기반임을 명시.

## 14. 시각 수용 기준 (Phase 3 완료 판정)

각 항목은 관찰 가능한 기준이다. "통과" 주장은 실제 실행 결과에 근거해야 한다.

1. **z-index**: mixer-info 팝오버 열림 + 토스트 발생 → 토스트가 팝오버 위에 렌더. 오버레이 z 리터럴 잔존 0건(grep `z-\[` 제외 허용 목록).
2. **focus ring**: 임의 컨트롤 Tab → 2px 불투명 `ring-ring`. `ring-ring/40`·`ring-ring/50` grep 0건.
3. **InputGroup**: `border-input` 실선 잔존 0건, inset 경계 렌더 확인.
4. **Button xl**: guild-card 링크 3종 높이 h-11 통일·hover/bg 오버라이드 잔존 최소. hero CTA h-11.
5. **상태 체계**: `/track` 빈 상태 문구에 진행형 부재. searchable-select·playlist-sidebar 빈 상태 EmptyState 렌더. ErrorPanel 재작성 후 `/shards` 에러 화면 동일 외형.
6. **타이포**: 푸터 그룹 제목·track 통계 라벨 12px. 랜딩 Discord 목업 11px 유지(예외 확인).
7. **모션**: framer duration 리터럴 `duration: 0.` grep → durations.ts 상수 import로 0건(스냅 예외 주석 제외).
8. **히어로**: 1440 GNB→H1 ≤120px, 768 ≤48px. 수평 오버플로우 0건(1440/768/390 전 라우트 승계 기준).
9. **대비**: wcag 스크립트 `Unexpected failures: 0`.
10. **콘솔**: `sizes` 경고 0건. 신규 console error 0건.
11. **기능 회귀**: ⌘K·테마 토글·모바일 탭바 내비·guild-card 분기(isInstalled/isManageable)·save-bar dirty 조건부 노출 전부 현행 동작 유지.
12. **문서**: 루트·대시보드 DESIGN.md의 스테일 항목(marquee·z-toast 문법·미존재 컴포넌트) 수정 완료.

## 15. 범위 밖 (Phase 3 추가 변경 금지)

§2 비목표 전부 + 다음:
- 팔레트·radius·elevation 값 자체 변경(이 문서는 현행값 승계 기준).
- 랜딩 콘텐츠·문구 대체(상태 문구 정합성 수정 제외).
- Discord 목업·봇 임베드(Components V2) 재디자인.
- 새 의존성·아이콘·일러스트·로고·장식 에셋.
- 접근성 compliance 공식 인증 주장(U-2 해소 전).

---

*Phase 2 산출. 이 문서의 제안은 브라우저 검증되지 않았다 — 모든 "현행" 기술은 DESIGN.current.md(소스+실측 근거)에서, 모든 "목표"는 이 문서에서 비롯된다. Phase 3는 §12 순서로 구현하고 §14 기준으로 판정한다.*