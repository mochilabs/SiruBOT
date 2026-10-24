# SiruBOT Dashboard Design System

`apps/dashboard`의 시각 토큰, 프리미티브, 레이아웃 규약을 정의하는 단일 레퍼런스다.
스타일시트 원본은 [`src/app/globals.css`](src/app/globals.css)이며, 제품 수준의 디자인 철학과 UX 원칙은 루트 [`DESIGN.md`](../../DESIGN.md)를 따른다.

---

## 1. 디렉터리 및 파일 구조

| 역할 | 경로 |
| --- | --- |
| 디자인 토큰, 테마 매핑, 유틸리티 | `src/app/globals.css` |
| shadcn/ui 설정 (`style: "base-nova"`) | `components.json` |
| 클래스 병합 헬퍼 (`cn()`) | `src/lib/utils.ts` |
| 로컬 폰트(`Pretendard`, `Pretendard JP`) + 루트 레이아웃 | `src/app/layout.tsx` |
| 테마·SWR·모션·토스트 프로바이더 | `src/components/Providers.tsx` |
| 페이지 크롬 (`Navbar`, `MobileTabBar`, `Container`, `Footer`, `ErrorPanel`) | `src/components/{navbar,container,footer,error-panel}.tsx`, `src/components/navbar/*` |
| 레이아웃·데이터·피드백 컴포넌트 | `src/components/{layout,data,feedback}/*` |
| 기본 UI 컨트롤 (`@base-ui/react` + `cva`) | `src/components/ui/*` |
| 조합 프리미티브 (`EmptyState`, `Field`, `SectionLabel`, `StatusDot`, `SidebarIndicator`, `MockThumbnail`) | `src/components/primitives/*` |
| 오버레이 (`Portal`, `GlobalCommandPalette`) | `src/components/overlay/*` |
| 모션 헬퍼 (`RevealGroup`, `RevealItem`) | `src/components/motion/*` |
| Discord 프리뷰·선택기 (`EmbedPreview`, `ChannelMessage`, `ChannelSelect`, `RoleSelect`, `PermissionList`) | `src/components/discord/*` |
| 디자인 시스템 갤러리 | `src/app/design/page.tsx` (`/design`) |

---

## 2. `globals.css` 9단 구조

`src/app/globals.css`는 아래 9개 섹션 순서를 유지한다.

1. **Tailwind & shadcn/ui 통합** — `@import "tailwindcss"`, `@import "tw-animate-css"`, `@import "../styles/shadcn-tailwind.css"`, `@custom-variant dark`.
2. **라이트·다크 시맨틱 테마 변수** — `:root` 및 `.dark` 블록의 시맨틱 팔레트와 Discord 프리뷰 토큰.
3. **Tailwind 테마 매핑 (`@theme inline`)** — 런타임 CSS 변수를 참조하도록 `@theme inline`으로 매핑해 `.dark` 클래스 토글이 즉시 반영되게 한다.
4. **타이포그래피 토큰** — `--font-sans`, `--text-2xs`(11px), `--text-3xs`(8px).
5. **반경 및 표면 토큰** — `--radius*`, 역할별 반경(`--r-*`), 불투명 표면(`--surface-1..3`).
6. **경계 및 그림자 토큰** — `--border-subtle/strong`, `--elev-1..3` 및 `--elev-5`, `--control-boundary`, `--toast-z`.
7. **상태 색상** — `--success`, `--warning`, `--info`, `--destructive`. `-foreground` 토큰 중 `--warning-foreground`·`--destructive-foreground`는 `Badge` 솔리드 톤이 소비(유지), `--success-foreground`·`--info-foreground`는 소비자 0건이므로 정리 대상.
8. **유틸리티 및 키프레임** — `@utility` 정의(`transition-control`, `animate-page-in`, `scrollbar-none`), 베이스 스크롤바, 키프레임. (`animate-marquee` 정의는 없음 — 컴포넌트와 함께 03971a7c에서 삭제됨)
9. **모션 토큰 및 접근성** — `--motion-fast/base/slow`, `--ease-out-expo`, View Transitions, `prefers-reduced-motion: reduce` 가드.

---

## 3. 토큰 레퍼런스

### 3.1 시맨틱 컬러 (Pink Beret 팔레트, 베이스 `#ffdada`)

| 토큰 | Light | Dark | 유틸리티 / 용도 |
| --- | --- | --- | --- |
| `--background` | `#fff9f9` | `#1f1618` | `bg-background` — 페이지 기본 배경 |
| `--foreground` | `#3a2c30` | `#fbeeee` | `text-foreground` — 기본 본문·제목 |
| `--card` / `--card-foreground` | `var(--surface-1)` / `#3a2c30` | `var(--surface-1)` / `#fbeeee` | `bg-card` — 기본 카드 표면 |
| `--popover` / `--popover-foreground` | `var(--surface-1)` / `#3a2c30` | `var(--surface-1)` / `#fbeeee` | `bg-popover` — 메뉴·모달·팝오버 |
| `--primary` / `--primary-foreground` | `#ffdada` / `#4f1c2a` | `#ffdada` / `#3a1a22` | `bg-primary text-primary-foreground` — 브랜드 소프트 표면 |
| `--brand` | `#ee6f8b` | `#f98aa0` | 포인트 핑크 원본 (`--primary-control`의 소스, 직접 유틸리티로 쓰지 않음) |
| `--primary-control` / `--primary-control-text` / `--primary-control-hover` | `var(--brand)` / `var(--primary-foreground)` / `#f27c96` | `var(--brand)` / `var(--primary-foreground)` / `#f27890` | `bg-primary-control text-primary-control-text` — 솔리드 CTA·활성 스위치 |
| `--primary-text` | `#4f1c2a` | `#ffdada` | `text-primary-text` — 중립 표면 위의 브랜드 강조 텍스트 (`text-primary`는 텍스트로 사용 금지) |
| `--secondary` / `--secondary-foreground` | `var(--surface-2)` / `#3a2c30` | `var(--surface-2)` / `#fbeeee` | `bg-secondary` — 보조 버튼·인셋 컨트롤 |
| `--muted` / `--muted-foreground` | `var(--surface-2)` / `#7d686d` | `var(--surface-2)` / `#b9a4a9` | `bg-muted`, `text-muted-foreground` — 보조 설명·비활성 |
| `--accent` / `--accent-foreground` | `#ffc3c9` / `#4f1c2a` | `#4d3b40` / `#ffdada` | `bg-accent` — 메뉴 포커스·호버 강조 |
| `--border` / `--input` | `#f3d3d6` / `var(--border)` | `#4d3b40` / `var(--border)` | `border-border`, `bg-input` (`--input`은 `--border`의 별칭으로, 컨트롤 내부 채움과 `shadow-control-boundary`를 조합해 쓴다) |
| `--border-subtle` / `--border-strong` | `#f8e1e4` / `#b4779b` | `#3a2c30` / `#a37d89` | `border-border-subtle`, `border-border-strong` (3:1 비텍스트 경계 대비용) |
| `--ring` | `#c4476a` | `var(--brand)` (`#f98aa0`) | `ring-ring` — 라이트 모드는 3:1 대비를 위해 `--brand`보다 어두운 `#c4476a`를 사용 |
| `--dot-neutral` | `var(--muted-foreground)` | 동일 | `bg-dot-neutral` — 중립 상태 점 |
| `--rank-1` / `--rank-2` / `--rank-3` | `#b47716` / `#8f8f8f` / `#b0743a` | `#f0b232` / `#b9bbbe` / `#cd7f32` | `text-rank-*` — 차트 1·2·3위 왕관 색상 |

### 3.2 불투명 표면 (`--surface-*`)

| 토큰 | Light | Dark | 유틸리티 및 역할 |
| --- | --- | --- | --- |
| `--surface-1` | `#ffffff` | `#2b2023` | `bg-surface-1` — 기본 카드·패널 |
| `--surface-2` | `#fff0f0` | `#3a2c30` | `bg-surface-2` — 카드 내부의 중첩 그룹·리스트 행·보조 컨트롤 |
| `--surface-3` | `#ffffff` | `#3a2c30` | `bg-surface-3` — 플로팅 저장 바·오버레이 및 `bg-secondary → hover:bg-surface-3` 호버 단계 |

### 3.3 반경 (`--r-*`)

새 코드에서는 `rounded-lg/xl/2xl/3xl` 대신 역할 토큰만 사용한다 (`rounded-full`은 배지·칩·아바타·상태 점에만 허용).

| 토큰 | 값 | 유틸리티 및 역할 |
| --- | --- | --- |
| `--r-control-inner` | `0.375rem` (6px) | `rounded-control-inner` — 컨트롤 내부 칩·애드온 |
| `--r-control` | `0.625rem` (10px) | `rounded-control` — 버튼, 입력창, 셀렉트 트리거 |
| `--r-menu` | `0.75rem` (12px) | `rounded-menu` — 드롭다운, 팝오버, 사이드바 메뉴 아이템 |
| `--r-card` | `1rem` (16px) | `rounded-card` — 카드, 섹션 패널, 리스트 아이템 |
| `--r-dialog` | `1rem` (16px) | `rounded-dialog` — 모달(`Dialog`), 시트(`Sheet`) |

### 3.4 컨트롤 경계, 그림자, 레이어링

| 구분 | 토큰 | 값 / 유틸리티 | 용도 |
| --- | --- | --- | --- |
| 컨트롤 경계 | `--control-boundary` | `shadow-control-boundary` (`inset 0 0 0 1px var(--border-strong)`) | 중립 버튼·입력창의 3:1 경계 |
| 오류 경계 | `--control-boundary-invalid` | `shadow-control-boundary-invalid` (`inset 0 0 0 1px var(--destructive)`) | 유효성 실패 입력창 |
| 그림자 | `--elev-1/2/3/5` | `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-2xl` | 높낮이(Elevation) 전용 — 장식용 그림자 금지 |
| Z-index 레이어 | `--z-content/savebar/float/overlay/popover-high` | `10/30/40/50/60` → `z-(--z-*)` | 레이아웃 레이어·저장 바·플로팅 액션·모달·오버레이 위 팝오버. 카드 내부 국소 스택(`relative z-10`)은 로컬 관례로 토큰 대상 아님 |
| 토스트 Z-index | `--toast-z` | `100` → `z-(--toast-z)` | Tailwind v4에는 `--z-*` 테마 네임스페이스가 없으므로 arbitrary CSS 변수 문법 `z-(--toast-z)`로 소비 |

### 3.5 타이포그래피와 모션

- **폰트 스택**: `--font-sans` (`Pretendard Variable` → `Pretendard JP Variable` → `Twemoji Mozilla` → 시스템 폴백).
- **마이크로 텍스트**: `text-2xs` (`0.6875rem` / 11px), `text-3xs` (`0.5rem` / 8px, 워터마크·축소 썸네일 전용).
- **트랜지션**: 숫자 duration 클래스 대신 `duration-fast`(200ms), `duration-base`(300ms), `duration-slow`(500ms), `ease-standard`(`cubic-bezier(.16,1,.3,1)`), `transition-control`을 사용한다.
- **무한 루프 예외(R-19)**: `BackgroundShapes`(배경 도형 3개, 모바일 숨김), 404/푸터 `ShapeBand`, 히어로 스크롤 셰브론, 타이핑 커서·생각 중 점·플레이리스트 이퀄라이저(실제 상태 표현). 모두 `prefers-reduced-motion` 가드를 포함한다. (`animate-marquee` 커맨드 마키는 03971a7c에서 삭제됨)

---

## 4. 레이아웃 및 컴포넌트 규약

### 4.1 공통 페이지 레이아웃
- **`Container` (`src/components/container.tsx`)**: `mx-auto w-full max-w-7xl px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 min-h-[calc(100svh-var(--navbar-h))]`. 상단 `Navbar`가 `sticky`이므로 `pt-6 sm:pt-8`로 모든 페이지 헤더와 내비게이션 사이의 기본 간격을 보장한다.
- **`MobileTabBar` (`src/components/navbar/mobile-tab-bar.tsx`)**: 모바일(`< md`) 전용 하단 플로팅 내비게이션. 375px 폭에서 5개 탭 라벨이 잘리지 않도록 `text-2xs`와 `px-0.5` 패딩을 사용한다. 루트 레이아웃(`src/app/layout.tsx`)의 `pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:pb-0`가 하단 탭바 가림을 방지한다.

### 4.2 서버 대시보드 및 플로팅 저장 바 (`SaveBar`)
- **사이드바 및 탭**: `ServerFeatureSidebar`는 `lg:sticky lg:top-20`과 `max-h-[calc(100svh-7rem)] overflow-y-auto`를 사용해 13개 설정 탭이 작은 노트북 화면에서도 잘리지 않고 스크롤되도록 한다.
- **플로팅 저장 바 계약 (`src/components/servers/settings-shared.tsx`)**:
  - 활성 탭(`SettingsPanelActive`)에 미저장 변경(`dirty`)이 있거나 저장 요청(`saving`) 중일 때만 `Portal`을 통해 하단 플로팅 아일랜드(`bg-surface-3 rounded-card shadow-2xl`)를 렌더링한다.
  - 비활성 탭의 미저장 상태도 모듈 레지스트리(`dirtySaveBars`)에 유지되어 서버 전환 시(`hasUnsavedSettings()`) 경고를 제공하고, 탭을 떠나려 할 때는 모달로 막지 않고 `nudgeSaveBar()`로 저장 바를 흔들어 알린다.
  - 저장 바의 실측 높이만큼 폼 하단 여유 공간을 확보해 마지막 필드와 오류 메시지가 가려지지 않게 한다.

### 4.3 플레이리스트 · 웹 플레이어 · 소셜 알림 UI 규약
- **곡 제목 링크**: 웹 대시보드의 모든 트랙 제목(라이브 플레이어 현재 곡·대기열·검색 결과, 플레이리스트 상세·곡 추가 모달, 홈 차트, 프로필 TOP 5, 서버 통계)은 유효한 `http/https` 주소가 있을 때 새 탭으로 열리는 `<a>` 링크로 렌더링한다.
- **외부 썸네일 이미지**: YouTube(`i.ytimg.com`) 등 외부 음원 썸네일에 `next/image`를 쓸 때는 서버 사이드 프록시 타임아웃(`UND_ERR_SOCKET`)을 방지하기 위해 `unoptimized` 속성을 지정하거나 `<img>` + 에러 폴백(`MockThumbnail`)을 사용한다.
- **플레이리스트 재정렬**: 위/아래 화살표 버튼이나 별도 듣기 버튼 열을 두지 않는다. 데스크톱은 드래그 핸들(`GripVertical`) 및 행 드래그 앤 드롭, 모바일은 길게 누르기(220ms) 후 터치 드래그, 키보드는 행 포커스 상태에서 `Alt + ↑/↓`로 순서를 바꾼다.
- **소셜 알림 목록 및 웹훅 프로필**:
  - 구독 목록의 각 행은 40px 웹훅 아바타 미리보기, 플랫폼·상태 배지, 채널명, 한 줄 요약만 담은 컴팩트 카드로 표시한다.
  - 구독 편집은 리스트 인라인 확장이 아닌 `Dialog` 모달에서 수행하며, 웹훅 프로필(아바타 + 표시명 + 섬네일 토글)은 `WebhookProfileSection` 컴포넌트로 묶어 표현한다.

---

## 5. 금지 패턴 (Anti-Slop 체크리스트)

```tsx
// ✗ 하드코딩된 HEX / 임의 Tailwind 팔레트 금지
<div className="bg-[#ff85c1] text-pink-400" />

// ✗ 컴포넌트 내부에서 dark: 분기 남발 금지 (globals.css 변수로 해결)
<div className="bg-white dark:bg-[#1a0e12]" /> // → bg-surface-1 또는 bg-background

// ✗ 중립 배경 위에서 text-primary 사용 금지 (라이트 모드 대비 미달)
<span className="text-primary">강조</span> // → text-primary-text 사용

// ✗ 새 코드에서 rounded-lg / glass-panel / motion(대신 m) 사용 금지
```

- **예외 허용**: Discord 브랜드 고정색(`#5865F2`), 사용자 지정 임베드 색상(`embed.color`), Discord 역할 색상 정수 변환값, 사이트별 고정 브랜드 액센트.
- 토큰 수정 후에는 반드시 `python3 scripts/wcag-contrast-audit.py`를 실행해 `Unexpected failures: 0`을 확인한다.
