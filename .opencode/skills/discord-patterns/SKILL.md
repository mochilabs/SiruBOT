---
name: discord-patterns
description: >
  SiruBOT 대시보드의 Discord 스타일 UI(임베드 미리보기, 채널 메시지, 길드/채널/유저/역할 셀렉터,
  권한 토글 리스트)를 재현·확장할 때 사용. Discord 색상 토큰과 CDN URL 규칙을 지킨다.
---

# Discord Patterns Skill

## Overview

Discord UI 근사 컴포넌트는 `src/components/discord/`에 모여 있다. 원칙:

1. Discord 색상은 **`--discord-*` 토큰만** 사용 (라이트/다크 자동 전환).
2. 실제 Discord API 데이터 형태(`permissions` 비트마스크, 역할 `color` 정수 등)를 그대로 받는다.
3. 이미지는 `next/image` + `next.config.ts`에 등록된 `cdn.discordapp.com`만 허용.

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

## 3. GuildSelector — `guild-selector.tsx`

```ts
export interface GuildInfo {
	id: string; name: string; icon?: string | null;
	memberCount?: number; isInstalled: boolean; isManageable?: boolean;
}
// props: guilds, onManage?, onController?, inviteUrl?, view?: "grid" | "list"
```

- 아이콘 URL: `https://cdn.discordapp.com/icons/${id}/${icon}.webp?size=128` (직접 조립, 없으면 이름 첫 글자 + `glass-overlay`)
- 설치됨: `ShieldCheck` + `시루봇 활성`(primary), 미설치: `미설치` + 초대 링크
- 액션: 관리(primary 계열) / 플레이어(emerald 계열) / 초대(`glass-overlay` + `ExternalLink`)
- grid: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, list: `flex flex-col gap-3`

## 4. 셀렉터 3종

### ChannelSelect / UserSelect — `overlay/select` 래퍼

`Select`(`src/components/overlay/select.tsx`)의 `SelectOption`으로 데이터를 변환해서 쓴다.

```tsx
<ChannelSelect channels={channels} value={channelId} onChange={setChannelId}
	filterTypes={["text"]} searchable placeholder="채널을 선택해 주세요" />
<UserSelect users={users} value={userId} onChange={setUserId} />
```

- 채널: `type`별 아이콘(text `Hash`, voice `Volume2`, announcement `Megaphone`, thread `MessageSquare`),
  `category`는 제외, `position` 정렬, `parentName`을 그룹으로.
- 유저: `discordAvatarUrl(id, avatar, 32)` + `fallback=username`.

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
- 카테고리 일괄 토글, `dangerous` 권한은 빨간 텍스트 + `AlertTriangle`
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
