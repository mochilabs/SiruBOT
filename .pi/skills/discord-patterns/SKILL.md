---
name: discord-patterns
description: >
  SiruBOT 대시보드의 Discord 스타일 UI(임베드 미리보기, 채널 메시지, 길드 카드, 검색형 셀렉터,
  역할 선택, 권한 토글 리스트)를 재현·확장할 때 사용. Discord 색상 토큰과 CDN URL 규칙을 지킨다.
---

# Discord Patterns Skill

## Overview

Discord UI 근사 컴포넌트는 `src/components/discord/`에 모여 있다. 원칙:

1. Discord 색상은 **`--discord-*` 토큰만** 사용 (라이트/다크 자동 전환).
2. 실제 Discord API 데이터 형태(`permissions` 비트마스크, 역할 `color` 정수 등)를 그대로 받는다.
3. 이미지는 `next/image` + `next.config.ts` `remotePatterns` 등록 호스트만 허용
   (`cdn.discordapp.com`, `i.ytimg.com`, `i.scdn.co`, `*.sndcdn.com`, `api.dicebear.com` — §6 참조).
4. Discord CDN URL 빌더는 `@/lib/discord-cdn`(순수 함수) — 서버 컴포넌트에서도 안전하다.

## 1. EmbedPreview — `embed-preview.tsx`

Discord 임베드를 재현하는 **읽기 전용** 컴포넌트. 데이터 스키마가 export 되어 있다.

```ts
export interface EmbedData {
	color?: string;                 // 좌측 바 색상, 기본 "#5865F2"
	author?: { name: string; iconUrl?: string; url?: string };
	title?: string; titleUrl?: string;
	description?: string;
	fields?: { name: string; value: string; inline?: boolean }[];
	image?: string; thumbnail?: string;
	footer?: { text: string; iconUrl?: string; timestamp?: string };
}
```

구조 규칙:

- 외곽: `flex max-w-[520px] bg-discord-embed rounded-md overflow-hidden`
- 좌측 컬러 바: `w-1 shrink-0 rounded-l-md` + `style={{ backgroundColor: embed.color }}`
- `fields`는 `inline` 존재 시 `grid-template-columns: repeat(3, 1fr)`, 없으면 `1fr`
- 텍스트: `text-discord-text`, 보조: `text-discord-text-muted`, 링크 제목: `text-discord-blue`
- footer 구분선: `border-t border-white/5`

```tsx
<EmbedPreview
	embed={{
		color: "#ff85c1",
		author: { name: "시루" },
		title: "지금 재생 중",
		description: "Blinding Lights — The Weeknd",
		fields: [
			{ name: "요청자", value: "User#1234", inline: true },
			{ name: "길이", value: "3:22", inline: true },
			{ name: "대기열", value: "4곡", inline: true }
		],
		footer: { text: "시루 뮤직", timestamp: "오늘 오후 3:42" }
	}}
/>
```

**보안**: `description`/`fields.value`는 Discord 응답·사용자 입력이 들어올 수 있다.
React 텍스트 노드로 렌더링되므로 그대로 두고, 절대 `dangerouslySetInnerHTML`로 풀어주지 않는다.

## 2. ChannelMessage — `channel-message.tsx`

채널 메시지 레이아웃. 부모가 `bg-discord-bg rounded-xl overflow-hidden py-2` 감싸줌.

```tsx
<div className="bg-discord-bg rounded-xl overflow-hidden py-2">
	<ChannelMessage
		author={{ id: "bot", username: "시루", bot: true }}
		content="🎵 지금 재생 중: **Blinding Lights** — The Weeknd"
		timestamp="오후 3:42"
	>
		<div className="mt-2"><EmbedPreview embed={...} /></div>
	</ChannelMessage>
</div>
```

- `content`의 `**굵게**` 마크다운을 렌더링할 때도 HTML 변환 금지 → JSX 분해 또는 단순 정규식 치환 후 텍스트 노드로.

컴포넌트 import는 전부 **`@/components/ui/*`**(shadcn 커스텀) 계열이다 — `<Badge>`, `<Button>`, `<Card>`,
`<Avatar>`, `<Switch>`를 `components/primitives/`에서 찾지 말 것 (primitives는 4종만 남음, `ui-primitives` 스킬 참조).
실전 사용 예시는 **`src/app/design/page.tsx`**(`/design`).

## 2.5. Discord 채널 목업 프레임 (랜딩/온보딩 미리보기)

**현재 사용처는 `home/features-section.tsx`뿐** (프레임 원형이 여기 있다). `hero-section.tsx`는 목업 프레임 대신
`DiscordCommandAnimation`(`home/discord-command-animation.tsx`)을 다른 형식으로 쓴다.
**컴포넌트가 아니라 클래스 조합 규약**으로 사용한다 (일회성 mock이라 primitives로 승격하지 않는다).

```tsx
<div className="flex min-w-0 flex-col overflow-hidden rounded-card border border-border-subtle bg-discord-embed">
	{/* 채널 헤더 — 채널명 + 아이콘, 좌측 정렬 */}
	<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
		<Bot size={14} className="text-discord-text-muted" aria-hidden />
		<span className="text-xs font-semibold text-discord-text">ai-라운지</span>
		<span className="ml-auto text-2xs text-discord-text-muted">시루 · 멘션 응답</span>
	</div>

	{/* 메시지 영역 — 실전에서는 <ChatPreview /> 같은 내부 컴포넌트가 min-h-[150px] flex-1 을 채운다.
	    항상 상단 정렬. items-center / justify-center 금지 (중앙 정렬되면 어색함) */}

	{/* 입력창 자리 푸터 — 읽기 전용 안내문 */}
	<p className="border-t border-discord-btn-active px-4 py-2 text-2xs text-discord-text-muted">
		@시루 멘션으로 말 걸면 도구를 골라 써요.
	</p>
</div>
```

규칙:

- **`bg-discord-embed`는 "Discord 목업 프레임" 한정으로만 쓴다.** 일반 카드 안의 부가 UI(설정 토글 리스트,
  프리뷰 패널)에까지 이 배경을 씌우면 "카드 안에 또 카드"가 되어 이상하다 — 그럴 땐 `bg-surface-2` 등
  대시보드 토큰으로 대체한다.
- 메시지 버블은 `flex gap-2.5` + 좌측 36px 아바타 + 우측 본문 구조. 시간·"앱" 배지는
  `text-2xs text-discord-text-muted` / `bg-discord-primary text-primary-foreground`.
- **타이핑 커서**: 봇 응답(스트리밍)은 `StreamingTypeText`, 슬래시 타이핑은 `TypingText` 사용.
  커서는 `inline-block h-[0.9em] w-[2px] ... align-baseline`에 **거의 0에 가까운 좌측 여백**을 준다
  (`TypingText`는 클래스 `-ml-px`, `StreamingTypeText`는 인라인 `marginLeft: "1px"`). 여유 margin을 크게
  주면 다음 단어가 밀려나 정렬이 깨진다.
- 줄바꿈 정렬 깨짐 방지용 `TypingText fit` prop: 가장 긴 후보의 폭을 invisible로 예약해 layout jump 제거.

## 3. GuildCard — `servers/guild-card.tsx` (+ `guild-card.types.ts`)

구 `guild-selector.tsx`는 삭제됐다. 현행은 서버 선택 카드 하나뿐.

```ts
export interface EnrichedGuild extends DiscordGuild { isManageable: boolean; isInstalled: boolean }
export interface GuildCardProps { guild: EnrichedGuild; inviteUrl: string | null }
```

- 아이콘 URL: `` `https://cdn.discordapp.com/icons/${id}/${icon}.png` `` (size 파라미터 없음), 없으면 이름 첫 글자 + `bg-surface-2` 원
- 설치 표시: `ShieldCheck` + `이미 시루봇이 있어요`(primary-text) / `아직 시루봇이 없어요`(muted) — 모바일에서는 숨김
- 액션: 관리(`Settings2`) / 재생(`Play`) / 초대·멤버 초대(`ExternalLink`, `UserPlus`) — `guild.isInstalled` / `isManageable` 분기
- 레이아웃: PC는 `md:` 그리드 카드, 모바일은 한 행 리스트 — 같은 마크업에 반응형 클래스만 (터치 타깃 `pointer-coarse:min-h-11`)

## 4. 셀렉터

### SearchableSelect — `servers/searchable-select.tsx` (설정 폼 공용)

구 `overlay/select.tsx`(ChannelSelect/UserSelect/SelectOption)는 삭제됐다. 채널·유저·JTC·음악·인사 설정 폼이
이 컴포넌트를 쓴다 (Base UI `Select` + 검색 입력).

```ts
export interface SearchableOption { value: string; label: string; icon?: ReactNode; group?: string; disabled?: boolean }
// props: options, value, onChange, multiple?, searchable?, placeholder, searchPlaceholder, disabled
```

- 단일/다중 겸용 (`multiple`에 따라 `value: string` vs `string[]`), `group`은 optgroup으로 묶인다.
- 채널 옵션은 `buildChannelOptions`가 카테고리 제외·`SELECTABLE_CHANNEL_TYPES` 필터·`parentName` 그룹핑 수행.
- 유저 아바타는 `discordAvatarUrl(id, avatar, 32)` (`@/lib/discord-cdn`) + `fallback=username`.

### RoleSelect — `role-select.tsx` (다중, Portal 기반)

```ts
export interface DiscordRole { id: string; name: string; color: number; position: number }
// props: roles, value: string[], onChange: (ids: string[]) => void, placeholder, disabled
```

- `color`는 Discord 정수 → `#rrggbb`: `color.toString(16).padStart(6, "0")`, `0`이면 무색.
- 정렬: `position` 내림차순. 선택 칩/옵션 모두 `style`로 색상(배경 `15`, 테두리 `40` suffix = 알파 헥스).
- 드롭다운은 `Portal` + `usePopoverCoords`로 body 렌더, backdrop `z-[190]` / 패널 `z-[200]`.

```tsx
<RoleSelect roles={roles} value={selectedRoleIds} onChange={setSelectedRoleIds} />
```

## 5. PermissionList — `permission-list.tsx`

Discord 권한 비트마스크(`flag: number`) 토글. `DISCORD_PERMISSIONS` 카테고리 데이터 export.

```tsx
const [perms, setPerms] = useState(0);
<PermissionList categories={DISCORD_PERMISSIONS} value={perms} onChange={setPerms} />
```

- 판정: `(value & flag) === flag`, 토글: `value | flag` / `value & ~flag`
- 카테고리 일괄 토글, `dangerous` 권한은 `text-destructive` + `AlertTriangle`
- 서버 측에서도 동일한 비트 로직으로 검증한다 (BigInt 사용 — `src/lib/guild-permissions.ts` 참고).

## 6. 색상·CDN 규칙

```tsx
// ✓ 토큰 사용
<div className="bg-discord-embed text-discord-text">
<Badge variant="discord">BOT</Badge>       // bg-discord-primary/10 ...

// ✗ Discord 색상 하드코딩
<div style={{ background: "#2b2d31" }} />
<div className="bg-[#5865F2]" />          // → discord-primary 토큰
```

- `next/image` 원격 호스트는 `next.config.ts`의 `remotePatterns`에 등록된 것만 가능:
  `cdn.discordapp.com`, `i.ytimg.com`, `i.scdn.co`, `*.sndcdn.com`, `api.dicebear.com`
  → 새 CDN을 쓰려면 **설정 파일을 먼저 수정**해야 한다.
- GIF 아바타(`a_` 해시)는 `?size=` 파라미터와 함께 `.gif` 확장자를 써야 한다.

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ Discord API 원본 JSON을 그대로 렌더 (권한/색상 필드 미가공)
<div dangerouslySetInnerHTML={{ __html: embed.description }} />

// ✗ 임베드를 위한 새 컴포넌트 재발명
<div className="border-l-4 bg-gray-800 p-3">내가 만든 임베드</div>   // → EmbedPreview

// ✗ 권한 체크를 클라이언트 boolean으로만 의존
{canManage && <DeleteButton />}   // 서버 Route에서도 반드시 재검증 (dashboard-conventions 스킬)
```
