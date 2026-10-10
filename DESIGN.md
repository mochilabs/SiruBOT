---
version: alpha
name: SiruBOT
description: >-
  시루봇 — 디스코드 고음질 음악 스트리밍 봇 & 웹 대시보드.
  시루떡처럼 따뜻하고 포근한 웜톤 로즈·플럼 아이덴티티.
colors:
  # ── 브랜드 (테마 무관) ──
  primary: "#ff85c1"                # 시루 핑크 — 배경·하이라이트·장식 전용 (텍스트 색 금지)
  primary-foreground: "#ffffff"     # primary 위 텍스트
  primary-control: "#c14377"        # 화이트 텍스트를 얹는 단색 컨트롤 표면 전용 — 화이트 대비 4.84:1 AA.
                                    # #ff85c1 위 화이트는 2.24:1 미달이므로 텍스트 표면으로 쓰지 않는다. 2026-10-10 소유자 승인(대비 확보).
  secondary: "#d4a574"              # 인절미 골드 — 장식(shape) 전용, 컨트롤 배경 금지
  discord-brand: "#5865f2"
  discord-blue: "#00a8fc"
  discord-light: "#949cf7"
  destructive: "#d4183d"            # 테마 무관 / -foreground #ffffff
  destructive-foreground: "#ffffff"

  # ── 다크 테마 (기본: defaultTheme="dark") ──
  background: "#1a0e12"             # 딥 플럼 블랙
  foreground: "#fce7f3"             # 소프트 로즈 핑크
  card: "#2d1b1e"
  card-foreground: "#fce7f3"
  popover: "#2d1b1e"
  popover-foreground: "#fce7f3"
  muted: "#3d2328"
  muted-foreground: "#c9a8b5"
  accent: "#4d2a35"
  accent-foreground: "#ffb3d9"
  border: "#3d2328"
  border-subtle: "#2f1a1f"
  border-strong: "#8f5c69"          # 인터랙티브 경계 — 비텍스트 대비 3.0:1+
  input: "#3d2328"
  ring: "#ff85c1"                   # 다크 배경 대비 8.41:1
  primary-text: "#ff85c1"           # 텍스트용 핑크 — 다크에서는 primary와 동일
  surface-1: "#231317"              # 기본 패널
  surface-2: "#2d1b1e"              # 중첩/인셋
  surface-3: "#35212a"              # 플로팅 오버레이
  success: "#34d399"
  success-foreground: "#052e16"
  warning: "#fbbf24"
  warning-foreground: "#451a03"
  info: "#38bdf8"
  info-foreground: "#082f49"

  # ── 라이트 오버라이드 (접미사 -light) ──
  background-light: "#fef5f9"       # 웜 로즈 화이트
  foreground-light: "#2d1b1e"       # 다크 코코아
  card-light: "#ffffff"
  card-foreground-light: "#2d1b1e"
  popover-light: "#ffffff"
  popover-foreground-light: "#2d1b1e"
  muted-light: "#f9eff5"
  muted-foreground-light: "#7e5e6a" # AA 보정값 (구 #8b6d75 는 4.32:1 미달로 교체)
  accent-light: "#ffe4f0"
  accent-foreground-light: "#d1608a"
  border-light: "#f0d4e3"
  border-subtle-light: "#f8e6ef"
  border-strong-light: "#b4779b"
  input-light: "#f9eff5"
  ring-light: "#a3416f"             # 라이트 배경 대비 5.5:1+
  primary-text-light: "#a3416f"     # #ff85c1 은 라이트 배경 대비 2.09:1 미달 → 별도 텍스트 토큰
  surface-1-light: "#ffffff"
  surface-2-light: "#f7f1f4"
  surface-3-light: "#ffffff"
  success-light: "#0f7a52"
  warning-light: "#9a6100"
  info-light: "#0b6bb0"

  # ── Discord 미리보기 재현 토큰 (EmbedPreview 등) ──
  discord-embed: "#2b2d31"          # / 라이트 #f2f3f5
  discord-text: "#dbdee1"           # / 라이트 #313338
  discord-text-muted: "#a3a9b2"     # / 라이트 #5c5e66
  discord-btn-active: "#4e5058"     # / 라이트 #e3e5e8
  discord-btn-hover: "#6d6f78"      # / 라이트 #d5d6d7
  discord-bg: "#35373c"             # / 라이트 #ebedef

  # ── 봇 메시지 악센트 (Discord Components V2) ──
  bot-embed-default: "#ffdaff"      # DEFAULT_COLOR — 기본 임베드 컬러 바
  bot-ok: "#4299e1"                 # OK_COLOR — 안내/정상 응답
  bot-warn: "#f56565"               # WARN_COLOR — 경고/오류 응답
typography:
  sans:
    fontFamily: Pretendard Variable
    fontSize: 1rem
  display:
    fontFamily: Pretendard Variable
    fontSize: 3rem
    fontWeight: 900
    letterSpacing: -0.05em          # tracking-tighter + 그라데이션 타이틀
  heading:
    fontFamily: Pretendard Variable
    fontSize: 1.5rem
    fontWeight: 900
    letterSpacing: -0.05em
  body:
    fontFamily: Pretendard Variable
    fontSize: 0.875rem
    fontWeight: 500                 # text-sm font-medium
  caption:
    fontFamily: Pretendard Variable
    fontSize: 0.75rem
    fontWeight: 500
  micro:                            # text-2xs — 10px 토큰은 없음
    fontFamily: Pretendard Variable
    fontSize: 0.6875rem
    fontWeight: 500
    lineHeight: 1rem
  code:                             # 슬래시 커맨드 토큰 (bg-muted + rounded-sm)
    fontFamily: Pretendard Variable
    fontSize: 0.6875rem
    fontWeight: 700
    lineHeight: 1rem
rounded:
  control: 0.625rem                 # 버튼·인풋·셀렉트
  menu: 0.75rem                     # 드롭다운·팝오버
  card: 1rem                        # 카드·패널
  dialog: 1rem                      # 모달·시트
spacing:
  xs: 4px                           # Tailwind 기본 스케일(0.25rem 단위), 커스텀 간격 토큰 없음
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  touch: 44px                       # pointer-coarse 최소 탭 타깃 (min-h-11)
components:
  button-primary:
    backgroundColor: "{colors.primary-control}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    height: 36px                    # size md (h-9)
  button-primary-hover:
    backgroundColor: "#ad3968"      # primary-control #c14377 hover 명도 전환 (화이트 대비 5.6:1 유지)
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
    height: 36px                    # size md (h-9)
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
  button-danger:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
    rounded: "{rounded.control}"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.control}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.card}"
  card-muted:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.card}"
  panel:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.card}"
  popover-menu:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.menu}"
  dialog:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.dialog}"
  code-chip:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: 12px                            # rounded-sm = calc(1rem - 4px)
  skeleton:
    backgroundColor: "{colors.muted}"
    rounded: 14px                            # rounded-md = calc(1rem - 2px)
  divider:
    backgroundColor: "{colors.border}"
    height: 1px
  divider-subtle:
    backgroundColor: "{colors.border-subtle}"
    height: 1px
  control-border:
    backgroundColor: "{colors.border-strong}"
    height: 1px
  focus-ring:
    backgroundColor: "{colors.ring}"
    height: 2px
  label-muted:
    textColor: "{colors.muted-foreground}"   # SectionLabel · 캡션
  chip:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
  badge-primary:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.primary-text}"
  badge-success:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.success}"
  badge-success-contrast:
    backgroundColor: "{colors.success}"
    textColor: "{colors.success-foreground}"
  badge-warning-contrast:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.warning-foreground}"
  badge-info-contrast:
    backgroundColor: "{colors.info}"
    textColor: "{colors.info-foreground}"
  badge-warning:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.warning}"
  badge-destructive:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.destructive}"
  badge-info:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.info}"
  badge-discord:
    backgroundColor: "{colors.surface-1}"
    textColor: "{colors.discord-brand}"
  decorative-shape:
    backgroundColor: "{colors.secondary}"   # 인절미 골드 배경 도형
  bot-embed-default:
    backgroundColor: "{colors.bot-embed-default}"   # 봇 임베드 컬러 바
  bot-embed-ok:
    backgroundColor: "{colors.bot-ok}"
  bot-embed-warn:
    backgroundColor: "{colors.bot-warn}"
  discord-embed-preview:
    backgroundColor: "{colors.discord-embed}"
    textColor: "{colors.discord-text}"
  discord-embed-muted:
    textColor: "{colors.discord-text-muted}"
  discord-btn-active:
    backgroundColor: "{colors.discord-btn-active}"
  discord-btn-hover:
    backgroundColor: "{colors.discord-btn-hover}"
  discord-app-bg:
    backgroundColor: "{colors.discord-bg}"
  discord-embed-accent:
    backgroundColor: "{colors.discord-light}"
  discord-embed-blue:
    backgroundColor: "{colors.discord-blue}"
  input-border:
    backgroundColor: "{colors.border}"       # 폼 컨트롤 보더 (border-border)
  input-bg:
    backgroundColor: "{colors.input}"
---

# SiruBOT 디자인 시스템

> 이 문서는 [design.md 포맷](https://github.com/google-labs-code/design.md)(alpha)을 따른다.
> 위 YAML 토큰이 규범 값이며, 본문은 적용 이유와 방법을 설명한다.
> 웹 대시보드의 실제 구현 소스는 `apps/dashboard/src/app/globals.css`이고 상세 토큰 표는
> `apps/dashboard/DESIGN.md`에 있다. 코드와 이 문서가 다르면 **코드가 기준**이다.

## Overview

- **서비스**: 디스코드 고음질 음악 스트리밍 및 서버 유틸리티 봇 & 웹 대시보드
- **페르소나**: '시루' — 시루떡처럼 따뜻하고 쫄깃하며, 유쾌하고 믿음직한 음악 친구
- **보이스 & 톤**: 친근하고 부드러운 경어체("~해요", "~기억해둘게!"). 기계적 응답 대신 직관적·다정한 안내를 쓰고, 과장된 마케팅 수식어는 지양한다. 모든 사용자 문구는 한국어.
- **디자인 다이얼**: `ENERGY 2 / RHYTHM 2 / MOTION 2` — 포근한 활기를 닫되 과도한 네온·글로우·무한 루프 장식 없이 정돈된 구조를 유지한다. 장식을 추가하려면 코드 주석에 사유를 기록한다(예: `animate-marquee`, `BackgroundShapes`).

## Colors

시루떡의 팥·인절미와 딸기 모찌를 연상시키는 웜톤 로즈 & 플럼 팔레트. 다크가 기본 테마이며 라이트는 CSS 변수 재정의(`.dark` 클래스)로만 분기한다.

> **YAML 토큰 규약**: front matter의 시맨틱 컬러 토큰은 **다크(기본 테마)** 값이며,
> 라이트 값은 `-light` 접미사 토큰(`background-light` 등)으로 나열한다. 컴포넌트 토큰은
> 다크 기준으로 참조하고, 라이트 모드에서는 대응 `-light` 토큰으로 치환해 렌더링한다.

**브랜드**

- **Primary `#ff85c1` (시루 핑크)** — 버튼·배지·하이라이트의 배경 전용. 라이트 모드에서 텍스트 색으로 쓰면 대비 2.09:1로 WCAG AA 미달이므로 텍스트에는 반드시 `primary-text`를 쓴다.
- **Secondary `#d4a574` (인절미 골드)** — 배경 도형 등 장식 전용. 컨트롤 배경으로 쓰면 흰 텍스트 대비 2.23:1로 확장 금지.
- **봇 임베드 `#ffdaff`** — 봇이 렌더하는 Discord Components V2 컨테이너의 기본 컬러 바(`DEFAULT_COLOR`). 상태 응답은 `#4299e1`(안내), `#f56565`(경고).

**테마별 시맨틱 토큰**

| 구분 | 라이트 | 다크 | 용도 |
| :--- | :--- | :--- | :--- |
| Background | `#fef5f9` | `#1a0e12` | 뷰포트 배경 |
| Foreground | `#2d1b1e` | `#fce7f3` | 기본 본문 텍스트 |
| Card / Popover | `#ffffff` | `#2d1b1e` | 패널·카드·모달 표면 |
| Surface 1/2/3 | `#ffffff` / `#f7f1f4` / `#ffffff` | `#231317` / `#2d1b1e` / `#35212a` | 패널 / 인셋 / 오버레이 (불투명, glass 금지) |
| Muted | `#f9eff5` | `#3d2328` | 비활성 영역, 서브 배경 |
| Muted Foreground | `#7e5e6a` | `#c9a8b5` | 보조 설명·라벨 (AA 보정값) |
| Border / Subtle / Strong | `#f0d4e3` / `#f8e6ef` / `#b4779b` | `#3d2328` / `#2f1a1f` / `#8f5c69` | 구분선 / 조용한 선 / 인터랙티브 경계(3.0:1+) |
| Ring | `#a3416f` | `#ff85c1` | 키보드 포커스 링 |
| Accent | `#ffe4f0` | `#4d2a35` | 칩·태그·선택 배경 (`bg-accent/50` hover) |

**상태 색상** — `success`, `warning`, `info`, `destructive` (+ 각 `-foreground`). 테마마다 값이 갈린다(라이트 `#0f7a52`/`#9a6100`/`#0b6bb0`, 다크 `#34d399`/`#fbbf24`/`#38bdf8`, destructive 공통 `#d4183d`). `emerald-500/10` 같은 임의 팔레트 대신 이 토큰을 쓴다.

**Discord 미리보기 토큰** — EmbedPreview가 Discord 실제 UI를 재현할 때만 쓰는 별도 토큰(`discord-embed`, `discord-text`, `discord-text-muted`, `discord-btn-*`, `discord-bg`). 다크/라이트 값은 YAML 주석과 코드 주석 참조.

## Typography

- **폰트**: `Pretendard Variable` (next/font/local → `--font-pretendard`). `--font-sans`가 이를 가리키므로 `font-sans` 전체가 Pretendard다.
- **스케일**: 페이지 타이틀 `text-4xl sm:text-5xl font-black tracking-tighter`(+ 그라데이션은 브랜드 히어로 전용), 섹션 제목 `text-2xl font-black tracking-tighter`, 본문 `text-sm font-medium`, 캡션 `text-xs`, 마이크로 `text-2xs`(11px).
- **숫자**: 통계·재생 시간은 `font-black tabular-nums` (음악 시간, 셔플 트랙 수, 핑/샤드 통계).
- **코드/명령어 토큰**: `bg-muted px-1.5 py-0.5 text-2xs font-bold rounded-sm` (`/노래`, `/셔플` 등). `text-[10px]`에는 대응 토큰이 없으므로 페이지 디자인 단계에서 별도 결정한다.
- 섹션 라벨은 `SectionLabel` 프리미티브(`text-xs font-medium`)를 쓴다. 장식적 캡션 uppercase/tracking은 새로 만들지 않는다.

## Layout

- **간격**: Tailwind 기본 스페이싱 스케일만 사용(4px 단위). 커스텀 간격 토큰 없음.
- **컨테이너**: `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8` (`src/components/container.tsx`).
- **모바일 뷰포트**: 고정 `100vh` 금지 — `100svh`, `100dvh`, `min-h-svh` 등 동적 뷰포트 단위 사용.
- **터치 타깃**: 모바일 포인터에서 최소 44px (`pointer-coarse:min-h-11`). 데스크탑 fine-pointer 크기(h-8/9/10)는 유지.
- **모션 토큰**: `duration-fast`(200ms) / `duration-base`(300ms) / `duration-slow`(500ms), `ease-out-expo`(`cubic-bezier(.16,1,.3,1)`). 숫자형 `duration-200/300/500` 대신 이름형 토큰을 쓴다. `prefers-reduced-motion: reduce`에서 전역 애니메이션이 0이 되며, framer-motion은 `MotionConfig reducedMotion="user"`로 존중한다.

## Elevation & Depth

다섯 단계의 의도된 엘리베이션(`--elev-1..5`)이 Tailwind 섀도 기본값을 대체한다:

| 유틸리티 | 토큰 | 용도 |
| --- | --- | --- |
| `shadow-xs`, `shadow-sm` | `--elev-1` | 헤어라인 분리 |
| `shadow-md` | `--elev-2` | 기본 카드 |
| `shadow-lg` | `--elev-3` | 부유 카드, 헤더 |
| `shadow-xl` | `--elev-4` | 메뉴, 팝오버 |
| `shadow-2xl` | `--elev-5` | 모달, 드로어 |

- 섀도는 **높이(elevation) 표현 전용**이고 장식(글로우, 컬러 그림자)이 아니다.
- `blur`/`backdrop-filter` 유리 표면(glass)은 금지 — 서피스는 모두 불투명(`--surface-*`, `panel`)이다. 남은 브랜드 글로우(`text-title-gradient`, `/invite`의 `InteractiveGlow`)는 히어로/브랜딩 한정 레거시다.
- 테마 전환은 View Transitions API(`::view-transition-old/new(root)` 페이드)로 처리한다.

## Shapes

역할 기반 반경 토큰 — 새 코드는 이것만 쓴다:

| 토큰 | 값 | 유틸리티 | 용도 |
| --- | --- | --- | --- |
| `control` | `0.625rem` | `rounded-control` | 버튼·인풋·셀렉트 |
| `menu` | `0.75rem` | `rounded-menu` | 드롭다운·팝오버 |
| `card` | `1rem` | `rounded-card` | 카드·패널 |
| `dialog` | `1rem` | `rounded-dialog` | 모달·시트 |

- 버튼·컨트롤은 알약형(pill) 금지 — `rounded-control`을 쓴다. 예외: **배지(Badge)는 `rounded-full`** 이 원래 코드 관례다.
- 새 `rounded-xl`/`rounded-2xl` 사용 금지 — 역할 토큰을 고른다(역할과 값이 모두 맞는 기존 코드만 치환).
- 보더: 기본 `border-border`, 조용한 구분선 `border-border-subtle`, 인터랙티브 경계 `border-border-strong`(비텍스트 대비 3.0:1+).

## Components

**웹 대시보드** — 재사용은 `src/components/primitives/*` 프리미티브 조합으로만 한다:

| 프리미티브 | 핵심 토큰 |
| --- | --- |
| `Button` (`primary/secondary/ghost/danger/icon/state-toggle/cta`, `sm/md/lg`) | `rounded-control`, `duration-fast`, `pointer-coarse:min-h-11` |
| `Card` (`variant: default/muted/raised/interactive`, `padding`) | `bg-surface-*`, `rounded-card`, `border-border` |
| `Input`, `Textarea`, `Field` | `rounded-control`, `bg-input`, `ring-ring`, `aria-invalid` |
| `Badge`, `StatusDot`, `StatusBadge` | `toneStyles` 톤 맵 (`neutral/primary/success/warning/destructive/info/discord`) — `톤/10 bg + 톤/25 border + 톤 text` 관례 |
| `EmptyState`, `Skeleton`, `SectionLabel`, `Tabs` | 상태·빈 데이터·탭 패널의 유일한 구현 |

용도별 조합: 콘텐츠 블록 = `Card`, 폼 컨트롤 = `rounded-control bg-input border border-border`, 메뉴·토스트 = `bg-popover rounded-menu shadow-2xl`, 단순 묶음 = `panel`(불투명 서피스 + 보더 + 카드 반경 한 번에 적용).

**봇 (Discord Components V2)** — 웹 UI와 같은 톤을 봇 메시지로 재현한다:

- 메시지는 `ContainerBuilder` + `TextDisplayBuilder` 규격을 준수하고, 브랜드 색상은 `DEFAULT_COLOR`(=`#ffdaff`)를 기본으로 쓴다.
- 진행바는 앱 이모지 6셀(start·mid×4·end, 셀당 2스텝 — 총 11단계)로 구성한다.
- 봇 아이콘·이모지는 데이터(사용자 입력 재현)이지 디자인 토큰이 아니다. 컨트롤 아이콘은 stroke 기반 Lucide로 통일한다.

## Do's and Don'ts

**할 것**

- 토큰 유틸리티만 쓴다: `bg-primary`, `text-primary-text`, `text-muted-foreground`, `border-border`, `rounded-menu` …
- 텍스트 색은 불투명도 파생 없이 풀 토큰으로 쓴다(파생 `/NN`은 AA 미달; 예외 `text-foreground/75` 이상).
- 라이트/다크 분기가 필요하면 토큰을 `.dark` 블록에서 재정의한다.
- 무한 루프·반복 장식을 추가할 때는 코드 주석과 문서에 사유(R-19 형식)를 기록하고, `prefers-reduced-motion`을 존중한다.
- 상태는 색뿐 아니라 텍스트·도트를 함께 표현한다(`StatusDot`/`StatusBadge`).
- 사용자 문구는 부드러운 한국어 경어체("~해요")로 쓴다.

**하지 말 것**

- 컴포넌트에 하드코딩 hex/rgb 금지 (`bg-[#ff85c1]`, `bg-pink-400` → `bg-primary`). 예외: Discord 브랜드 `#5865F2`, 사용자 입력 embed 컬러, Discord 역할/아바타 원본 색.
- 라이트 배경 위 텍스트에 `text-primary` 금지 → `text-primary-text` (2.09:1 미달).
- `--secondary`(인절미 골드)를 버튼·배지 컨트롤 배경으로 확장 금지 — 장식 전용.
- 새 `dark:` 변형 분기 금지 — 토큰 재정의로 처리(진단용 상태색 임의값은 예외).
- 토큰이 있는 값에 임의값 금지 (`text-[11px]` → `text-2xs`).
- 숫자형 duration (`duration-200/300/500`) 금지 → `duration-fast/base/slow`.
- 새 `rounded-xl`/`rounded-2xl` 사용 금지; 버튼/컨트롤 pill 금지.
- 유리 표면(glass, backdrop-blur) 재도입 금지 — 불투명 서피스만.
- 섀도를 장식으로 남발 금지 — 엘리베이션 표현만.
- 봇 응답의 과장된 마케팅 수식어 금지 — 제공하는 편의와 즐거움에 집중.