---
name: ui-primitives
description: >
  SiruBOT 대시보드 UI 프리미티브·오버레이·레이아웃 컴포넌트의 props/variant/사용 예시.
  신규 화면이나 컴포넌트를 만들 때, 또는 기존 버튼/뱃지/셀렉터/모달 등의 인터페이스를 확인해야 할 때 사용.
  일회성 스타일 작성 금지 — 항상 primitives 조합으로 만든다.
---

# UI Primitives Skill

## Overview

컴포넌트는 4계층이다. 새 컴포넌트는 **아래 계층을 조합**해서만 만들고, 같은 역할의 새 컴포넌트를 재발명하지 않는다.

| 계층 | 위치 | 내용 |
| --- | --- | --- |
| primitives | `src/components/primitives/` | button, card, input, field, badge, empty-state, section-label, tabs, skeleton, avatar, slider, switch, status-dot |
| overlay | `src/components/overlay/` | select, modal, drawer, dropdown, date-picker, command-palette, portal |
| discord | `src/components/discord/` | embed-preview, channel-message, guild-selector, channel/user/role-select, permission-list |
| layout / data / feedback | `src/components/{layout,data,feedback}/` | container, page-header, navigation, sidebar, data-table, stat-card, tag-input, toast, notification |

- 실전 사용 예시: `src/app/components_gallery/page.tsx` (모든 컴포넌트가 여기서 한 번씩 쓰인다)
- 스타일은 전부 `design-tokens` 스킬의 토큰 클래스로만 구성.
- 대부분 `"use client"` + `lucide-react` 아이콘 + `framer-motion`(`m`, `AnimatePresence`).
- `primitives/*`는 `cn()` + `cva` 조합. 일회성 클래스 문자열을 새로 만들지 말고 이쪽에 variant를 추가한다.

## primitives

### Button — `src/components/primitives/button.tsx`

```ts
variant?: "primary" | "secondary" | "ghost" | "danger" | "icon" | "state-toggle" | "cta";  // 기본 primary
size?: "sm" | "md" | "lg";   // sm h-8, md h-9(기본), lg h-10 — 전부 rounded-control
loading?: boolean;   // true면 Spinner + children 흐리게, disabled 처리
active?: boolean;    // state-toggle 전용 on/off (data-active)
icon?: React.ReactNode;
type?: "button" | "submit";  // 기본 "button"
```

```tsx
<Button variant="primary" size="md" onClick={play}>재생</Button>
<Button variant="danger" icon={<Trash2 size={16} />}>삭제하기</Button>
<Button variant="icon" size="sm" icon={<Settings size={16} />} aria-label="설정" />
<Button variant="state-toggle" active={shuffle} onClick={toggleShuffle}>셔플</Button>
<Button loading={saving}>저장 중...</Button>
<Button variant="cta">시작하기</Button>   {/* 그라디언트/시머 없음 — 단단한 primary + shadow-sm */}
```

- 그라디언트·시머·`hover:scale` 없음. 상태 변화는 `transition-colors`만.
- `focus-visible:ring-2 ring-ring/40` 유지. 기본 `type="button"`.
- variant는 이 7개뿐 — `premium/success/glass/gradient/floating` 등 신규 variant와
  `NavigationButton` 같은 새 버튼 프리미티브를 만들지 않는다.
- **raw `<button>`은 분류 후에만 옮긴다** (Phase 3B, 디자인 시스템 8장 참고):
  A 액션 → `Button` · B 아이콘 → `variant="icon"`(aria-label 필수) · C 토글 → `state-toggle`;
  D 셀렉터/메뉴/옵션/콤보박스(`role="option|combobox|menuitem|radio"`), E 라우팅 링크,
  F Discord mock/마케팅·커스텀 인디케이터는 **그대로 유지**한다.
  파일·전역 일괄 치환은 금지. 대시보드 기준 50 → 25 (이식 24 · `Navigation` 삭제 1 · 유지 25).
- **raw `<input>`도 마찬가지**: 일반 텍스트 입력만 `<Input>`/`<Field>`. 팝오버·팔레트·칩
  검색 필드는 키보드/포커스/레이아웃 처리가 달라 유지 (5 → 4).

### Card — `card.tsx`

```ts
variant?: "default" | "muted" | "raised" | "interactive";  // 기본 default
padding?: "none" | "sm" | "md" | "lg";                      // 기본 md (p-5)
```

```tsx
<Card variant="muted" padding="lg">
  <CardHeader><CardTitle>제목</CardTitle><CardDescription>설명</CardDescription></CardHeader>
  <CardContent>...</CardContent>
  <CardFooter><Button size="sm">저장</Button></CardFooter>
</Card>
```

- 불투명 표면 + `rounded-card`. blur/그라디언트 없음. 그림자는 `raised`의 `shadow-sm`뿐.

### Input / Textarea — `input.tsx`

```ts
Input: React.InputHTMLAttributes<HTMLInputElement>        // 기본 type="text", h-9
Textarea: React.TextareaHTMLAttributes<HTMLTextAreaElement> // rows=3, min-h-20 resize-y
```

- 공용 `controlBase`: `rounded-control border-border bg-input` + focus ring +
  `aria-invalid:` destructive. 커스텀 클래스는 `className`으로 덮어쓴다.
- 아이콘 있을 때는 `className="pl-9"` 처럼 좌우 패딩만 지정.

### Field — `field.tsx`

```ts
label: string;  description?: ReactNode;  error?: ReactNode;
required?: boolean;  htmlFor?: string;
children: ReactNode | ((p: { id, describedBy, invalid }) => ReactNode)
```

```tsx
<Field label="모델" description="비워두면 env 기본값" htmlFor="ai-model">
  <Input id="ai-model" />
</Field>

<Field label="검색" error="값이 올바르지 않아요.">
  {({ id, describedBy, invalid }) => <Input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} />}
</Field>
```

- `error`는 `role="alert"`. 렌더 프롭을 쓰면 label↔컨트롤이 실제로 연결된다.
- `hint`는 `description`으로 통일 (settings-shared의 `Field`는 제거됨).

### Badge / StatusBadge — `badge.tsx`

```ts
variant?: "default" | "primary" | "success" | "warning" | "danger" | "destructive" | "info" | "discord";
size?: "sm" | "md";  dot?: boolean;  dismissible?: boolean;  onDismiss?: () => void;
// StatusBadge: <StatusBadge status="READY" /> — READY/IDLE/CONNECTING/DISCONNECTED/ERRORED
```

```tsx
<Badge variant="primary">DJ</Badge>
<Badge variant="success" dot>온라인</Badge>
<StatusBadge status={process.status} />
```

- 색은 `toneStyles`(토큰 기반) 한 곳에서 관리. `StatusDot`도 같은 맵을 쓴다.
- `components/status-badge.tsx`는 삭제됨 — 항상 `primitives/badge`에서 import.

### EmptyState — `empty-state.tsx`

```ts
icon?: ComponentType<{className?}>;  title: string;  description?: ReactNode;
action?: ReactNode;  secondaryAction?: ReactNode;  size?: "sm" | "md";
```

```tsx
<EmptyState icon={Music} title="플레이리스트가 비어있어요" description="채워보세요!"
  action={<Button onClick={open}>곡 추가하기</Button>} />
```

### SectionLabel — `section-label.tsx`

```tsx
<SectionLabel as="p">최근 재생</SectionLabel>
```

- 조용한 스타일(`text-xs font-medium text-muted-foreground`). `font-black` /
  `uppercase` / `tracking-widest` 금지.

### Tabs — `tabs.tsx`

```ts
items: { key, label, icon?, badge?, disabled? }[];
value?/defaultValue?/onChange?;  renderPanel?: (key) => ReactNode;  "aria-label": string;
```

```tsx
<Tabs aria-label="설정 탭" value={tab} onChange={setTab}
  items={[{ key: "overview", label: "개요" }, { key: "settings", label: "설정" }]}
  renderPanel={(key) => <div>...</div>} />
```

- `role="tablist"`, 밑줄 인디케이터(`border-b-2 border-primary`), 방향키 로빙 포커스.
- 페이지 내부 탭/패널 전환은 전부 여기로 통합 (Phase 3B에서 `layout/navigation` 삭제).
  route 이동·필터·segment·radio는 Tabs로 옮기지 않는다.

### Avatar — `avatar.tsx`

```ts
src?: string | null;  fallback?: string;  size?: "xs" | "sm" | "md" | "lg";  // 32/40/56/80px
ring?: boolean;       status?: "online" | "idle" | "dnd" | "offline";
```

- 헬퍼 export: `discordAvatarUrl(userId, hash, size)`, `discordGuildIconUrl(guildId, hash, size)`
  (`a_` 접두 → gif, 그 외 webp)
- `src` 없으면 `fallback` 첫 글자 + `bg-surface-2 border-border` 원.

### Skeleton — `skeleton.tsx`

```tsx
import { Skeleton } from "@/components/primitives/skeleton";
<Skeleton.Line width="60%" height="h-4" />
<Skeleton.Circle size="h-12 w-12" />
<Skeleton.Card lines={3} avatar />     {/* <Card> + role="status" aria-label="로딩 중" */}
```

- 바탕은 `bg-muted` + `animate-pulse` (`bg-foreground/10` 금지).

### Slider — `slider.tsx`

```ts
value?: number; defaultValue?: number; min=0; max=100; step=1;
onChange?: (v: number) => void; disabled?: boolean;
label?: string; showValue?: boolean; formatValue?: (v: number) => string;
```

- 컨트롤드/언컨트롤드 겸용(`value` 전달 시 컨트롤드).
- pointer capture 기반 드래그, 키보드(←→↑↓ Home End) 지원, `role="slider"` + aria.
- 볼륨·시크·쿨다운 등 모든 레인지 입력에 이 컴포넌트 사용.

```tsx
<Slider value={volume} onChange={setVolume} label="볼륨" showValue formatValue={(v) => `${v}%`} />
```

### Switch — `switch.tsx`

```ts
checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void;
disabled?: boolean; label?: string; labelPosition?: "left"|"right"; size?: "sm"|"md";
```

- thumb는 framer-motion 스프링(`stiffness 500, damping 30`). `role="switch"`, Space 키 토글.

### StatusDot — `status-dot.tsx`

```ts
status?: "ready" | "idle" | "connecting" | "disconnected" | "errored";  // success/warning/info/destructive/destructive
size?: "sm" | "md" | "lg";  pulse?: boolean = true;  label?: string;
```

```tsx
<StatusDot status="ready" label="READY" />
```

- 톤은 `primitives/badge`의 `toneStyles`를 공유 — 색을 여기서 따로 정의하지 말 것.

## overlay (`src/components/overlay/`)

| 컴포넌트 | 핵심 props | 비고 |
| --- | --- | --- |
| `Select` | `options: SelectOption[]`, `value`, `onChange`, `multiple?`, `searchable?`, `placeholder`, `disabled` | `SelectOption = { value, label, icon?, group? }`. 단일/다중 겸용 |
| `Modal` + `ModalHeader/Body/Footer` | `open`, `onClose` | 포커스 트랩, ESC 닫힘 |
| `Drawer` | `open`, `onClose`, `title` | 우측 슬라이드인 |
| `Dropdown` | `trigger: ReactNode`, `groups: DropdownGroup[]` | `DropdownItem = { key, label, icon?, danger?, onClick }` |
| `DatePicker` | `value: Date \| null`, `onChange` | 캘린더 |
| `CommandPalette` | `open`, `onClose`, `items` | ⌘K/Ctrl+K |
| `Portal`, `usePopoverCoords` | — | 포탈 + 트리거 기준 좌표 계산 (`role-select`가 사용) |

## layout / data / feedback

```tsx
import Container from "@/components/container";           // max-w-7xl 페이지 래퍼
<Container><PageHeader title="..." description="..." /></Container>

// PageHeader: 우측 액션 슬롯 children, 하단 border 구분
<PageHeader title="플레이리스트" description="곡을 모아봐요">
	<Button size="sm" onClick={openCreate}>새로 만들기</Button>
</PageHeader>

// Sidebar (compound)
<Sidebar><Sidebar.Header>...</Sidebar.Header><Sidebar.Content>
	<Sidebar.Group label="음악"><Sidebar.Item icon={<Play />} label="재생" active badge={4} onClick={...} /></Sidebar.Group>
</Sidebar.Content><Sidebar.Toggle /></Sidebar>
```

- `DataTable<T>`: `columns: Column<T>[]`(`key, header, sortable?, align?, width?, render?`), `data`, `keyExtractor`
- `StatCard`: `icon?, label, value, sub?, trend?: "up"|"down"|"neutral", trendValue?` — `Card` 위에 렌더링
- `TagInput`: `value: string[]`, `onChange`, `maxTags`
- Toast: 래퍼에 `<ToastProvider>` 필수 → `const toast = useToast();`
  `toast.success/error/info/warning(message, description?)` (갤러리 예시 기준 2인자도 허용)
- Notification: `NotificationStack items={NotificationItem[]} onDismiss={(id) => void}`

## 랜딩 페이지 목업 패턴 (primitives 아님 — 규약만 있음)

`features-section.tsx` / `hero-section.tsx`의 "Discord처럼 보이는 프레임"은 primitives로 승격하지 않고,
**discord-patterns 스킬의 §2.5 "Discord 채널 목업 프레임"** 클래스 조합 규약을 따라갑니다.

- 메시지/타이핑 목업은 항상 **상단 정렬** (`items-center`, `items-end`로 중앙·하단 정렬 금지)
- 커서 애니메이션(`TypingText`/`StreamingTypeText`)은 `-ml-px`로 이전 글자에 거의 붙여서, 다음 단어가
  밀려나 정렬이 깨지는 일이 없게 한다
- 카드 안에 또 `bg-discord-embed` 카드를 넣지 않는다 — 부가 패널은 `bg-surface-2`/`rounded-control`
  등 대시보드 서피스 토큰 사용 (Discord 목업 프레임 한정으로만 `--discord-*` 배경 사용)

## 이렇게 쓰세요

```tsx
"use client";
import { Play, SkipForward } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { Slider } from "@/components/primitives/slider";
import { Badge } from "@/components/primitives/badge";
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
// ✗ primitives를 무시하고 같은 역할의 버튼/토글을 새로 만들기
<button className="px-4 py-2 bg-pink-500 rounded-lg hover:bg-pink-600">재생</button>

// ✗ variant/size를 무시한 className으로 덮어쓰기
<Button variant="primary" className="!bg-emerald-500 !rounded-md">저장</Button>

// ✗ 토큰 없는 일회성 스타일 (아래는 전부 디자인 토큰 위반)
<div className="bg-[#1e1e1e] p-4 rounded-[10px] shadow-xl">...</div>

// ✗ 로딩 상태를 직접 구현
{loading && <span>...</span>}     // → <Button loading={loading} />

// ✗ 버튼에 그라디언트/시머/스케일 (Phase 2에서 제거한 것들)
<Button className="bg-gradient-to-r hover:scale-105 animate-shimmer-sweep">시작</Button>

// ✗ 또 하나의 입력 스타일 만들기
<input className="px-4 py-2.5 rounded-xl border ..." />   // → <Input> / <Field>

// ✗ 분류 없이 통째로 치환 (navigation/menu/option/mock 은 raw로 남아야 한다)
sed -i 's|<button|<Button|g' **/*.tsx
grep -rl "<input" src | xargs sed -i 's|<input|<Input|g'

// ✗ 새 버튼/입력 프리미티브나 variant 추가
<Button variant="premium">프리미엄</Button>
<FancyInput />, <SearchBox />, <SegmentControlV2 />

// ✗ rounded-full — 상태 배지·칩·상태 점·명시적 pill 전용
<div className="rounded-full ...">카드</div>

// ✗ 접근성 손실 (aria-label 없는 icon 버튼, role 없는 슬라이더)
<Button variant="icon" icon={<X size={16} />} />   // ✗ aria-label 없음

// ✗ framer-motion 기본 <motion> 대신 <m> lazy 컴포넌트 규칙 위반
// Providers는 LazyMotion(domAnimation)를 쓰므로 motion.* 대신 m.* 를 import 한다.
```
