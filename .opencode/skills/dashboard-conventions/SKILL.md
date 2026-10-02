---
name: dashboard-conventions
description: >
  SiruBOT 대시보드(apps/dashboard, Next.js 16 App Router) 코드 컨벤션: SWR/fetcher, zustand store,
  API Route 구조와 zod 검증, next-auth Discord OAuth 사용법, 보안 규칙, 린트/타입체크까지.
  대시보드에 페이지·API·훅·스토어를 추가하거나 수정할 때 항상 먼저 로드한다.
---

# Dashboard Conventions Skill

## Overview

- `apps/dashboard`: Next.js **16** App Router + React 19 + TypeScript, Tailwind v4
- 상태: SWR(서버 데이터) / zustand(클라이언트 UI) / next-auth(세션)
- 린트: **`eslint . --max-warnings=0`** (prettier 아님 — `yarn workspace @sirubot/dashboard lint`)
- 타입체크: `yarn workspace @sirubot/dashboard typecheck`
- 문자열은 전부 한국어. `"use client"`는 필요한 파일에만.

## 1. 디렉토리 구조

```
src/app/                    # 라우트 (page.tsx, api/**/route.ts)
src/components/{primitives,overlay,discord,layout,data,feedback}/
src/hooks/                  # use-playlists.ts, use-debounce.ts
src/lib/                    # auth.ts, fetcher.ts, db.ts, shard-api.ts, guild-permissions.ts
src/store/                  # zustand (use-ui-store.ts, use-search-store.ts)
src/types/                  # 공용 타입
```

상대 import는 `@/` 별칭 (`@/components/...`, `@/lib/...`).

## 2. 데이터 페칭 — fetcher + SWR

`src/lib/fetcher.ts`:

```ts
export async function fetcher<T = unknown>(url: string): Promise<T> {
	const res = await fetch(url);
	if (!res.ok) throw new Error("Network response was not ok");
	return res.json();
}
```

전역 설정은 `src/components/Providers.tsx`에 있다 — **키를 두 번 지정하지 말 것**:

```ts
<SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000 }}>
```

사용 예시:

```tsx
"use client";
import useSWR from "swr";

// 조건부 키: 인증 전엔 null (미인증 요청 방지)
const { data, error, isLoading, mutate } = useSWR<ShardsResponse>(
	status === "authenticated" ? "/api/playlists" : null
);

// 폴링이 필요한 상태 페이지만 refreshInterval 지정
useSWR<ShardsResponse>("/api/shards", { refreshInterval: 5000 });
```

변경 후 캐시 갱신 (낙관적 업데이트 + 롤백 예시 — `src/hooks/use-playlists.ts`):

```ts
// 1) 먼저 로컬 캐시 교체 (revalidate: false)
mutateDetail({ playlist: activePlaylist!, tracks: reindexed }, { revalidate: false });
// 2) 서버 저장 시도
const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
const data = await res.json();
if (!res.ok) throw new Error(data.error || "Failed");
// 3) 성공/실패 상관없이 재검증
await mutateDetail();
```

- POST/PATCH/DELETE는 `fetch` + `res.ok` 체크 + `useToast()`로 피드백.
- 서버에서 직접 데이터가 필요하면 **Server Component**에서 `await fetch(..., { cache: "no-store" })`.

## 3. 클라이언트 상태 — zustand

```ts
// src/store/use-<name>-store.ts
import { create } from "zustand";

interface UIState {
	scrolled: boolean;
	setScrolled: (v: boolean) => void;   // 액션도 인터페이스에 선언
}
export const useUIStore = create<UIState>((set) => ({ scrolled: false, setScrolled: (v) => set({ scrolled: v }) }));
```

- 네이밍: 파일 `use-<name>-store.ts`, 훅 `use<Name>Store`.
- **서버 데이터를 zustand에 넣지 않는다** (SWR 영역). zustand는 UI 플래그/포커스/메뉴 열림 등에만.

## 4. API Route (`src/app/api/**/route.ts`)

모든 Route는 다음 순서를 지킨다.

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";

// ① 스키마 (zod v4)
const bodySchema = z.object({
	volume: z.number().int().min(0).max(100),
});

export async function POST(request: Request) {
	// ② 세션 검증 (진입점에서)
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	// ③ 길드 권한 검증 (해당 서버 관리자/DJ 여부)
	//    → src/lib/guild-permissions.ts canManage(accessToken, guildId) 또는
	//      (BigInt(permissions) & ADMINISTRATOR) 패턴
	if (!(await canManage(session.accessToken!, guildId))) {
		return NextResponse.json({ error: "권한이 없어요." }, { status: 403 });
	}

	// ④ 입력 검증
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
	}

	try {
		// ⑤ 비즈니스 로직
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("...", error);                       // 서버 로그에만
		return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
	}
}
```

실제 레퍼런스:

- 인증 + DB: `src/app/api/playlists/route.ts`
- Discord API + 권한 비트(`MANAGE_GUILD 0x20`, `ADMINISTRATOR 0x8`): `src/app/api/servers/route.ts`
- zod 쿼리 검증(`z.coerce.number().int().min(1)`): `src/app/api/tracks/route.ts`
- 외부 서비스 토큰 전달: `src/lib/shard-api.ts` (`SHARD_MANAGER_URL` + `Authorization` 헤더, **서버 전용**)

컨벤션:

- 상태 변경은 **POST/PATCH/DELETE만**, GET은 읽기 전용.
- 에러 메시지는 한국어, 클라이언트에 내부 스택/에러 객체 전달 금지.
- 401(미인증) / 403(권한 없음) / 400(검증 실패) / 500을 구분.

## 5. 인증 — next-auth v5 (`src/lib/auth.ts`)

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
	providers: [DiscordProvider({
		clientId: process.env.AUTH_DISCORD_ID,
		clientSecret: process.env.AUTH_DISCORD_SECRET,
		authorization: { params: { scope: "identify guilds" } },
	})],
	pages: { signIn: "/login", error: "/error" },
	// callbacks: jwt에 accessToken 저장 → session.accessToken에 노출
});
```

- **서버**(Route Handler / Server Component): `const session = await auth()`
- **클라이언트**: `useSession()` (`status === "loading" | "authenticated" | "unauthenticated"`)
- 미인증 리다이렉트: `router.push("/api/auth/signin?callbackUrl=/playlists")` 또는 링크 href를 그대로 지정 (`navbar.tsx`)
- 로그인/아웃: `signIn("discord")`, `signOut()`

### ⚠️ 보안 — 세션의 accessToken

현재 `session.accessToken`은 Discord 토큰을 담고 있다.

- **클라이언트 컴포넌트에 전달/렌더링하지 않는다.** `useSession().data.accessToken`을 JSX·props·`console.log`에 쓰지 말 것.
- 토큰이 필요한 외부 Discord API 호출은 **Route Handler 또는 Server Component 안에서만** 수행.
- 프로필 이미지·이름 등 필요한 데이터는 필요한 만큼만 클라이언트로 내려보낸다.
- 시크릿(`AUTH_*`, `SHARD_MANAGER_AUTH_KEY`, DB/Lavalink 비밀번호)은 항상 `process.env`로만 참조하며
  코드·클라이언트 번들(`NEXT_PUBLIC_` 제외)·로그에 남기지 않는다.

## 6. 클라이언트/서버 경계

- `"use client"` 최소화. 데이터가 필요하면 서버에서 `fetch` 후 프롭으로 전달.
- 클라이언트 컴포넌트에 **내부 주소·포트·엔드포인트 구조를 하드코딩하지 않는다**
  (예: `http://192.168.0.x:2333`) → 상대 경로 `/api/...` 또는 서버 Route를 경유.
- `next/image` 사용, 외부 호스트는 `next.config.ts` `remotePatterns` 등록 필요.

## 7. 보안 체크리스트 (PR 전 확인)

- [ ] 모든 Route Handler가 진입점에서 `auth()` 세션 검증
- [ ] 길드 경로(`/api/servers/[id]/...`)는 길드 권한(관리자/DJ) 재검증
- [ ] 클라이언트 번들에 시크릿·내부 주소·accessToken 없음 (`grep`으로 확인)
- [ ] 상태 변경 API는 POST + zod 검증 + 범위 재검증(볼륨 0–100, URL 형식 등)
- [ ] 컨트롤 API에 rate limit
- [ ] 외부 응답(가사 등)·사용자 입력은 HTML이 아닌 텍스트로 렌더 (`dangerouslySetInnerHTML` 금지)

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ 클라이언트에서 토큰 꺼내기
const { data } = useSession();
fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${data.accessToken}` } });

// ✗ 서버 URL 하드코딩
fetch("http://10.0.0.5:3001/api/shards");   // → lib/*.ts로 캡슐화 + process.env

// ✗ 검증 없는 body 사용
const { volume } = await request.json();     // → zod safeParse

// ✗ 미인증 라우트 방치 / 클라이언트 권한 체크만으로 끝내기

// ✗ zustand에 API 데이터 보관, SWR 키를 컴포넌트마다 다르게 지정
```

## 검증 커맨드

```bash
yarn workspace @sirubot/dashboard lint        # eslint . --max-warnings=0
yarn workspace @sirubot/dashboard typecheck   # tsc --noEmit
yarn workspace @sirubot/dashboard dev         # 단일 앱 실행
```
