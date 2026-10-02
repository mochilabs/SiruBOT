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
| primitives | `src/components/primitives/` | button, badge, avatar, skeleton, slider, switch, status-dot |
| overlay | `src/components/overlay/` | select, modal, drawer, dropdown, date-picker, command-palette, portal |
| discord | `src/components/discord/` | embed-preview, channel-message, guild-selector, channel/user/role-select, permission-list |
| layout / data / feedback | `src/components/{layout,data,feedback}/` | container, page-header, navigation, sidebar, data-table, stat-card, tag-input, toast, notification |

- 실전 사용 예시: `src/app/components_gallery/page.tsx` (모든 컴포넌트가 여기서 한 번씩 쓰인다)
- 스타일은 전부 `design-tokens` 스킬의 토큰 클래스로만 구성.
- 대부분 `"use client"` + `lucide-react` 아이콘 + `framer-motion`(`m`, `AnimatePresence`).

## primitives

### Button — `src/components/primitives/button.tsx`

```ts
variant?: "primary" | "secondary" | "ghost" | "danger" | "icon" | "state-toggle" | "cta";
size?: "sm" | "md" | "lg";
loading?: boolean;   // true면 Spinner + children 흐리게, disabled 처리
active?: boolean;    // state-toggle 전용 on/off
icon?: React.ReactNode;
```

```tsx
<Button variant="primary" size="md" onClick={play}>재생</Button>
<Button variant="danger" icon={<Trash2 size={16} />}>삭제하기</Button>
<Button variant="icon" size="sm" icon={<Settings size={18} />} aria-label="설정" />
<Button variant="state-toggle" active={shuffle} onClick={toggleShuffle}>셔플</Button>
<Button loading={saving}>저장 중...</Button>
<Button variant="cta">시작하기</Button>   {/* shimmer sweep 자동 */}
```

- `sizeClasses`: sm `h-9 px-3 rounded-xl`, md `h-11 px-5 rounded-2xl`, lg `h-14 px-8 rounded-2xl`
- `variant="icon"`이면 `h-9/w-9`·`h-11/w-11`·`h-14/w-14` 정사각.

### Badge — `badge.tsx`

```ts
variant?: "default" | "primary" | "success" | "warning" | "danger" | "info" | "discord";
size?: "sm" | "md";  dot?: boolean;  dismissible?: boolean;  onDismiss?: () => void;
```

```tsx
<Badge variant="primary">DJ</Badge>
<Badge variant="success" dot>온라인</Badge>
<Badge variant="discord" size="sm">BOT</Badge>
<Badge variant="danger" dismissible onDismiss={() => remove(id)}>제거</Badge>
```

### Avatar — `avatar.tsx`

```ts
src?: string | null;  fallback?: string;  size?: "xs" | "sm" | "md" | "lg";  // 32/40/56/80px
ring?: boolean;       status?: "online" | "idle" | "dnd" | "offline";
```

- 헬퍼 export: `discordAvatarUrl(userId, hash, size)`, `discordGuildIconUrl(guildId, hash, size)`
  (`a_` 접두 → gif, 그 외 webp)
- `src` 없으면 `fallback` 첫 글자 + `glass-overlay` 원.

### Skeleton — `skeleton.tsx`

```tsx
import { Skeleton } from "@/components/primitives/skeleton";
<Skeleton.Line width="60%" height="h-4" />
<Skeleton.Circle size="h-12 w-12" />
<Skeleton.Card lines={3} avatar />     {/* role="status" aria-label="로딩 중" 포함 */}
```

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
status?: "ready" | "idle" | "connecting" | "disconnected" | "errored";  // emerald/amber/sky/rose/rose
size?: "sm" | "md" | "lg";  pulse?: boolean = true;  label?: string;
```

```tsx
<StatusDot status="ready" label="READY" />
```

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

// Navigation: variant "underline"(기본) | "pill" | "segment"
<Navigation items={[{ key: "overview", label: "개요", icon: <Home size={14} />, badge: 3 }]}
	activeKey={tab} onSelect={setTab} variant="pill" />

// Sidebar (compound)
<Sidebar><Sidebar.Header>...</Sidebar.Header><Sidebar.Content>
	<Sidebar.Group label="음악"><Sidebar.Item icon={<Play />} label="재생" active badge={4} onClick={...} /></Sidebar.Group>
</Sidebar.Content><Sidebar.Toggle /></Sidebar>
```

- `DataTable<T>`: `columns: Column<T>[]`(`key, header, sortable?, align?, width?, render?`), `data`, `keyExtractor`
- `StatCard`: `icon, label, value, sub?, trend?: "up"|"down"|"neutral", trendValue?`
- `TagInput`: `value: string[]`, `onChange`, `maxTags`
- Toast: 래퍼에 `<ToastProvider>` 필수 → `const toast = useToast();`
  `toast.success/error/info/warning(message, description?)` (갤러리 예시 기준 2인자도 허용)
- Notification: `NotificationStack items={NotificationItem[]} onDismiss={(id) => void}`

## 이렇게 쓰세요

```tsx
"use client";
import { Play, SkipForward } from "lucide-react";
import { Button } from "@/components/primitives/button";
import { Slider } from "@/components/primitives/slider";
import { Badge } from "@/components/primitives/badge";
import { StatusDot } from "@/components/primitives/status-dot";

<div className="glass-panel p-6 space-y-4">
	<div className="flex items-center justify-between">
		<StatusDot status="ready" label="연결됨" />
		<Badge variant="primary" size="sm">{queueLength}곡</Badge>
	</div>
	<div className="flex gap-2">
		<Button variant="primary" icon={<Play size={16} />}>재생</Button>
		<Button variant="secondary" icon={<SkipForward size={16} />} />
	</div>
	<Slider value={volume} onChange={setVolume} label="볼륨" showValue formatValue={(v) => `${v}%`} />
</div>
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

// ✗ 접근성 손실 (aria-label 없는 icon 버튼, role 없는 슬라이더)
<Button variant="icon" icon={<X size={16} />} />   // ✗ aria-label 없음

// ✗ framer-motion 기본 <motion> 대신 <m> lazy 컴포넌트 규칙 위반
// Providers는 LazyMotion(domAnimation)를 쓰므로 motion.* 대신 m.* 를 import 한다.
```
