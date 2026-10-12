---
name: ui-primitives
description: >
  SiruBOT 대시보드 UI 컴포넌트(ui/primitives/overlay)의 계층·props/variant/사용 예시.
  신규 화면이나 컴포넌트를 만들 때, 또는 기존 버튼/뱃지/셀렉터/모달 등의 인터페이스를 확인해야 할 때 사용.
  일회성 스타일 작성 금지 — 항상 컴포넌트 조합으로 만든다.
---

# UI Primitives Skill

## Overview

컴포넌트는 5계층이다. 새 컴포넌트는 **아래 계층을 조합**해서만 만들고, 같은 역할의 새 컴포넌트를 재발명하지 않는다.

| 계층 | 위치 | 내용 |
| --- | --- | --- |
| ui | `src/components/ui/` | shadcn/ui(base-nova) 위에 토큰을 입힌 컨트롤·오버레이: button, card, input, input-group, textarea, label, badge, tabs, avatar, skeleton, slider, switch, select, dialog, sheet, dropdown-menu, command, table, toast |
| primitives | `src/components/primitives/` | 도메인 공용 조각: empty-state, field, section-label, status-dot |
| overlay | `src/components/overlay/` | portal(`Portal`, `usePopoverCoords`), global-command-palette |
| discord | `src/components/discord/` | embed-preview, channel-message, permission-list, role-select |
| layout / data / feedback | `src/components/{layout,data,feedback}/` | page-header, data-table, stat-card, tag-input, notification |

- 실전 사용 예시: **`src/app/design/page.tsx`** (`/design` 디자인 시스템 쇼케이스 — 모든 컴포넌트가 여기서 한 번씩 쓰인다).
- `src/components/` 루트의 `container`·`navbar`·`footer`·`error-panel` 등은 페이지 크롬/일회성 뷰다. 계층으로 승격하지 않는다.
- 스타일은 전부 `design-tokens` 스킬의 토큰 클래스로만 구성.
- `ui/*`는 **Base UI(`@base-ui/react`)** 프리미티브 + `cva` 기반 shadcn 컴포넌트다. 토큰/보더 규칙에 맞춰 이미 커스텀돼 있으므로 원본 shadcn 코드를 통째로 갈아엎지 말고, 필요한 variant만 추가한다.
- 대부분 `"use client"` + `lucide-react` 아이콘 + framer-motion(`m`, `AnimatePresence`).
- `primitives/*`, `data/*` 등 나머지는 `cn()` + `cva` 조합. 일회성 클래스 문자열을 새로 만들지 말고 이쪽에 variant를 추가한다.

## ui (`src/components/ui/`)

### Button — `src/components/ui/button.tsx`

```ts
variant?: "default" | "primary" | "secondary" | "ghost" | "danger" | "destructive"
       | "outline" | "link" | "icon" | "state-toggle" | "cta";   // 기본 default
size?: "default" | "sm" | "md" | "lg" | "xs" | "icon" | "icon-xs" | "icon-sm" | "icon-lg";
// default/md h-9, sm h-8, lg h-10, xs h-6 — 전부 rounded-control
loading?: boolean;   // true면 Loader2 스피너 + children 흐리게, disabled 처리
active?: boolean;    // state-toggle 전용 on/off (data-active)
icon?: React.ReactNode;
type?: "button" | "submit";  // 기본 "button"
```

```tsx
import { Button } from "@/components/ui/button";

<Button variant="primary" size="md" onClick={play}>재생</Button>
<Button variant="danger" icon={<Trash2 size={16} />}>삭제하기</Button>
<Button variant="icon" size="sm" icon={<Settings size={16} />} aria-label="설정" />
<Button variant="state-toggle" active={shuffle} onClick={toggleShuffle}>셔플</Button>
<Button loading={saving}>저장 중...</Button>
<Button variant="cta">시작하기</Button>   {/* 단색 primary-control 채움 + shadow-sm — 그라디언트/시머 없음 */}
<Button variant="secondary">보조</Button> {/* bg-secondary + shadow-control-boundary (비대칭 완화) */}
```

- 그라디언트·시머·`hover:scale` 없음. 상태 변화는 `transition-colors`만. `focus-visible:ring-2 ring-ring` 유지. 기본 `type="button"`.
- `danger`와 `destructive`는 같은 스타일(`bg-destructive/10 text-destructive`) — 신규 코드는 `danger`를 쓴다.
- variant는 이 11개뿐. `premium`/`glass`/`gradient` 등 신규 variant와 `NavigationButton` 같은 새 버튼 프리미티브를 만들지 않는다.
- **raw `<button>`은 분류 후에만 옮긴다**: A 액션 → `Button` · B 아이콘 → `variant="icon"`(aria-label 필수) · C 토글 → `state-toggle`;
  D 셀렉터/메뉴/옵션/콤보박스(`role="option|combobox|menuitem|radio"`), E 라우팅 링크,
  F Discord mock/마케팅·커스텀 인디케이터는 **그대로 유지**한다. 파일·전역 일괄 치환은 금지.
- **raw `<input>`도 마찬가지**: 일반 텍스트 입력만 `<Input>`/`<Field>`. 팝오버·팔레트·칩 검색 필드는 키보드/포커스/레이아웃 처리가 달라 유지.

### Card — `src/components/ui/card.tsx`

```ts
variant?: "default" | "muted" | "raised" | "interactive";  // 기본 default
padding?: "none" | "sm" | "md" | "lg";                      // 기본 md (p-5)
// 하위: CardHeader / CardTitle / CardDescription / CardAction / CardContent / CardFooter
```

```tsx
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";

<Card variant="muted" padding="lg">
	<CardHeader><CardTitle>제목</CardTitle><CardDescription>설명</CardDescription></CardHeader>
	<CardContent>...</CardContent>
	<CardFooter><Button size="sm">저장</Button></CardFooter>
</Card>
```

- `border-0` + `rounded-card` 불투명 표면. blur/그라디언트/장식 보더 없음(보더리스 규칙). 그림자는 `raised`의 `shadow-sm`뿐.

### Input / Textarea / Label — `ui/input.tsx`, `ui/textarea.tsx`, `ui/label.tsx`

```ts
Input: React.ComponentProps<"input">        // h-9, rounded-control, border-0, bg-input
Textarea: React.ComponentProps<"textarea">  // field-sizing-content, min-h-16, resize-y
```

- 공용: `border-0 bg-input` + **`shadow-control-boundary`**(inset 1px 경계선) + `focus-visible:ring-2 ring-ring` +
  `aria-invalid:` → `shadow-control-boundary-invalid`. 커스텀 클래스는 `className`으로 덮어쓴다.
- 아이콘/부가 요소가 필요하면 `InputGroup`/`InputGroupAddon`(`ui/input-group`) 조합. 좌측 패딩 임의 지정(`pl-9`) 대신 여기서 처리.
- 인풋 계열 raw 마크업은 분류 후에만 교체한다 (Button 항목의 raw `<input>` 규칙 참고).

### Field — `src/components/primitives/field.tsx`

```ts
label: string;  description?: ReactNode;  error?: ReactNode;
required?: boolean;  htmlFor?: string;
children: ReactNode | ((p: { id, describedBy, invalid }) => ReactNode)
```

```tsx
import { Field } from "@/components/primitives/field";

<Field label="모델" description="비워두면 env 기본값" htmlFor="ai-model">
	<Input id="ai-model" />
</Field>

<Field label="검색" error="값이 올바르지 않아요.">
	{({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
</Field>
```

- `error`는 `role="alert"`. 렌더 프롭을 쓰면 label↔컨트롤이 실제로 연결된다.
- `hint`는 `description`으로 통일. `<label>` 스타일이 필요하면 `ui/label`의 `Label`을 쓴다.

### Badge — `src/components/ui/badge.tsx`

```ts
variant?: "default" | "primary" | "secondary" | "success" | "warning" | "danger" | "destructive"
       | "info" | "discord" | "outline" | "ghost" | "link";
size?: "sm" | "md";  dot?: boolean;   // 기본 size "md"
```

```tsx
import { Badge } from "@/components/ui/badge";

<Badge variant="primary">DJ</Badge>
<Badge variant="success" dot>온라인</Badge>
```

- 색은 `text-* / bg-*/10` 토큰. 상태+색이 함께 필요하면 `StatusDot`을 쓴다.
- **`StatusBadge` 컴포넌트는 없다** — 상태 표시는 `primitives/status-dot`의 `StatusDot`으로 통일.

### EmptyState — `src/components/primitives/empty-state.tsx`

```ts
icon?: ComponentType<{className?}>;  title: string;  description?: ReactNode;
action?: ReactNode;  secondaryAction?: ReactNode;  size?: "sm" | "md";
```

```tsx
<EmptyState icon={Music} title="플레이리스트가 비어있어요" description="채워보세요!"
	action={<Button onClick={open}>곡 추가하기</Button>} />
```

### SectionLabel — `src/components/primitives/section-label.tsx`

```tsx
<SectionLabel as="p">최근 재생</SectionLabel>
```

- 조용한 스타일(`px-3 py-1.5 text-xs font-medium text-muted-foreground`). `font-black` /
  `uppercase` / `tracking-widest` 금지.

### Tabs — `src/components/ui/tabs.tsx`

```tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

<Tabs value={tab} onValueChange={(v) => v && setTab(v)} aria-label="서버 설정 패널">
	<TabsList variant="line">            {/* line(기본) | default(bg-muted) */}
		<TabsTrigger value="overview">개요</TabsTrigger>
		<TabsTrigger value="settings">설정</TabsTrigger>
	</TabsList>
	<TabsContent value="overview">...</TabsContent>
	<TabsContent value="settings">...</TabsContent>
</Tabs>
```

- Base UI `Tabs` compound. `value`/`onValueChange`, `TabsList > TabsTrigger`, `TabsContent` 구조.
- 페이지 내부 탭/패널 전환은 전부 여기로 통일 (`layout/navigation`은 삭제됨).
- route 이동·필터·segment·radio는 Tabs로 옮기지 않는다.

### Avatar — `src/components/ui/avatar.tsx`

```ts
src?: string | null;  alt?: string;  fallback?: string;  size?: "xs" | "sm" | "md" | "lg";  // 32/40/56/80px
ring?: boolean;       status?: "online" | "idle" | "dnd" | "offline";
```

- Discord CDN 헬퍼는 **`@/lib/discord-cdn`** (`discordAvatarUrl`, `discordGuildIconUrl` — 서버 사이드에서도 안전한 lib).
  (`a_` 접두 → gif, 그 외 webp)
- `src` 없으면 `fallback` 첫 글자 원형 아바타.

### Skeleton — `src/components/ui/skeleton.tsx`

```tsx
import { Skeleton, SkeletonLine, SkeletonCircle, SkeletonCard } from "@/components/ui/skeleton";

<SkeletonLine width="60%" height="h-4" />
<SkeletonCircle size="h-12 w-12" />
<SkeletonCard lines={3} avatar />     {/* role="status" aria-label="로딩 중" */}
<Skeleton className="h-8 w-24" />     {/* 기본 블록 */}
```

- `Skeleton.Line` / `.Circle` / `.Card` 정적 프로퍼티로도 접근 가능.
- 바탕은 `bg-muted` + `animate-pulse` (`bg-foreground/10` 금지).

### Slider — `src/components/ui/slider.tsx`

```ts
value?: number; defaultValue?: number; min=0; max=100; step=1;
onChange?: (v: number) => void; disabled?: boolean;
label?: string; showValue?: boolean; formatValue?: (v: number) => string;
```

- 컨트롤드/언컨트롤드 겸용(`value` 전달 시 컨트롤드), Base UI 프리미티브 위에 라벨/값 레이아웃을 얹은 것.
- 볼륨·시크·쿨다운 등 모든 레인지 입력에 이 컴포넌트 사용.

```tsx
<Slider value={volume} onChange={setVolume} label="볼륨" showValue formatValue={(v) => `${v}%`} />
```

### Switch — `src/components/ui/switch.tsx`

```ts
checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void;
disabled?: boolean; label?: string; labelPosition?: "left"|"right"; size?: "sm"|"md";
```

- off 트랙은 `bg-secondary` + `shadow-control-boundary`, on은 `bg-primary-control`. `role="switch"` 내장.

### StatusDot — `src/components/primitives/status-dot.tsx`

```ts
status?: "ready" | "idle" | "connecting" | "disconnected" | "errored";  // → success/warning/info/destructive/destructive
size?: "sm" | "md" | "lg";  pulse?: boolean;  label?: string;
```

```tsx
<StatusDot status="ready" label="READY" />
```

- **`toneStyles` 맵이 여기 있다** (`neutral/primary/success/warning/destructive/info/discord` → `{badge, dot, text}`).
  색을 다른 파일에서 따로 정의하지 말 것.
- `pulse`를 명시하지 않으면 `connecting`/`errored`만 깜빡인다(R-19).

## 오버레이 계층 (ui + overlay)

| 컴포넌트 | 위치 | 핵심 사용법 |
| --- | --- | --- |
| `Select` | `ui/select` | `Select > SelectTrigger(+SelectValue) > SelectContent > SelectGroup/SelectLabel/SelectItem` — portal popover, 키보드 내장 |
| `Dialog` | `ui/dialog` | `Dialog > Trigger > Content(Header/Title/Description/Footer/Close)` — 모달. 포커스 트랩, ESC 닫힘 |
| `Sheet` | `ui/sheet` | `Sheet > Trigger > Content` — 우측 슬라이드 시트(구 Drawer) |
| `DropdownMenu` | `ui/dropdown-menu` | `DropdownMenu > Trigger > Content > Item/CheckboxItem/RadioItem/Sub` |
| `Command` | `ui/command` | `Command/CommandDialog/CommandInput/CommandList/CommandGroup/CommandItem` (cmdk) |
| `GlobalCommandPalette` | `overlay/global-command-palette` | ⌘K/Ctrl+K 전역 팔레트 — `app/layout.tsx`에 마운트 |
| `Toast` | `ui/toast` | `toast.success/error/warning/info(message, description?)`. `<Toaster/>`는 `Providers.tsx`에 **단 1개만** 마운트 — Provider/래퍼 새로 만들지 말 것 |
| `Portal`, `usePopoverCoords` | `overlay/portal` | 포탈 + 트리거 기준 좌표 계산 (`discord/role-select`가 사용) |
| `SearchableSelect` | `components/servers/searchable-select` | 서버 설정 폼 전용 검색형 셀렉트(Base UI Select 기반) |

- `SelectTrigger` 기본 높이는 h-9(Input과 정렬), `size="sm"`은 h-7. 좌우 패딩 `pl-3 pr-2.5`.
- **Select.Value 계약 (Base UI)**: 아무것도 안 주면 **선택된 raw value(예: UUID)가 그대로 표시**된다. 라벨을 표시하려면 `Select.Root`에 `items`(Record/배열)를 넘기거나 `SelectValue`의 children에 렌더 함수를 넘겨야 한다
  (`<SelectValue>{(value) => labelOf(value)}</SelectValue>`). placeholder만으로는 이 문제가 해결되지 않는다.
- 삭제됨: `overlay/modal·drawer·dropdown·select·command-palette·date-picker`, `feedback/toast`, `SelectOption` 타입.
  새 화면은 이 표의 컴포넌트를 쓴다. 달력이 필요하면 새 컴포넌트를 추가하기 전에 사용처를 먼저 확인할 것.

## layout / data / feedback

```tsx
import Container from "@/components/container";           // default export — max-w-7xl 페이지 래퍼
<Container><PageHeader title="..." description="..." /></Container>

// PageHeader: 우측 액션 슬롯 children, 보더 없음(여백·크기로 구분)
<PageHeader title="플레이리스트" description="곡을 모아봐요">
	<Button size="sm" onClick={openCreate}>새로 만들기</Button>
</PageHeader>
```

- `DataTable<T>`: `columns: Column<T>[]`(`key, header, sortable?, align?, width?, render?`), `data`, `keyExtractor` — `src/components/data/data-table.tsx`
- `StatCard`: `icon?, label, value, sub?, trend?: "up"|"down"|"neutral", trendValue?` — `Card` 위에 렌더링
- `TagInput`: `value: string[]`, `onChange`, `maxTags`
- `NotificationStack`: `items={NotificationItem[]} onDismiss={(id) => void}`
- 사이드바는 복합 `Sidebar` 컴포넌트가 아니다 — 도메인별로 직접 만든다
  (`playlists/playlist-sidebar.tsx`, `servers/server-feature-sidebar.tsx` 참고).

## 랜딩 페이지 목업 패턴 (primitives 아님 — 규약만 있음)

`home/features-section.tsx` / `home/hero-section.tsx`의 "Discord처럼 보이는 프레임"은 primitives로 승격하지 않고,
**discord-patterns 스킬의 §2.5 "Discord 채널 목업 프레임"** 클래스 조합 규약을 따라간다.

- 메시지/타이핑 목업은 항상 **상단 정렬** (`items-center`, `items-end`로 중앙·하단 정렬 금지)
- 커서 애니메이션(`TypingText`/`StreamingTypeText`)은 `-ml-px`로 이전 글자에 거의 붙여서, 다음 단어가
  밀려나 정렬이 깨지는 일이 없게 한다
- 카드 안에 또 `bg-discord-embed` 카드를 넣지 않는다 — 부가 패널은 `bg-surface-2`/`rounded-control`
  등 대시보드 서피스 토큰 사용 (Discord 목업 프레임 한정으로만 `--discord-*` 배경 사용)

## 이렇게 쓰세요

```tsx
"use client";
import { Play, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { StatusDot } from "@/components/primitives/status-dot";

<Card className="gap-4">
	<div className="flex items-center justify-between">
		<StatusDot status="ready" label="연결됨" />
		<Badge variant="primary" size="sm">{queueLength}곡</Badge>
	</div>
	<div className="flex gap-2">
		<Button variant="primary" icon={<Play size={16} />}>재생</Button>
		<Button variant="secondary" icon={<SkipForward size={16} />} />
	</div>
	<Slider value={volume} onChange={setVolume} label="볼륨" showValue formatValue={(v) => `${v}%`} />
</Card>
```

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ 같은 역할의 버튼/토글을 새로 만들기
<button className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600">재생</button>

// ✗ variant/size를 무시한 className으로 덮어쓰기
<Button variant="primary" className="!bg-emerald-500 !rounded-md">저장</Button>

// ✗ 토큰 없는 일회성 스타일 (아래는 전부 디자인 토큰 위반)
<div className="bg-[#1e1e1e] p-4 rounded-[10px] shadow-xl">...</div>

// ✗ 로딩 상태를 직접 구현
{loading && <span>...</span>}     // → <Button loading={loading} />

// ✗ 버튼에 그라디언트/시머/스케일
<Button className="bg-gradient-to-r hover:scale-105 animate-shimmer-sweep">시작</Button>

// ✗ 또 하나의 입력 스타일 만들기
<input className="px-4 py-2.5 rounded-xl border ..." />   // → <Input> / <Field>

// ✗ 분류 없이 통째로 치환 (menu/option/mock 은 raw로 남아야 한다)
sed -i 's|<button|<Button|g' **/*.tsx
grep -rl "<input" src | xargs sed -i 's|<input|<Input|g'

// ✗ 새 버튼/입력 프리미티브나 variant 추가
<Button variant="premium">프리미엄</Button>
<FancyInput />, <SearchBox />, <SegmentControlV2 />

// ✗ rounded-full — 상태 배지·칩·상태 점·명시적 pill 전용
<div className="rounded-full ...">카드</div>

// ✗ 접근성 손실 (aria-label 없는 icon 버튼, label 없는 토글)
<Button variant="icon" icon={<X size={16} />} />   // ✗ aria-label 없음

// ✗ shadcn 컴포넌트를 통째로 다시 구현하거나 원본 코드를 덮어쓰기
//    (커스텀은 토큰/variant 레벨에서만)

// ✗ framer-motion 기본 <motion> 대신 <m> lazy 컴포넌트 규칙 위반
// Providers는 LazyMotion(domAnimation)를 쓰므로 motion.* 대신 m.* 를 import 한다.
```
