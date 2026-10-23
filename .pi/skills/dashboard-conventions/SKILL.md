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
src/app/                    # 라우트 (page.tsx, api/**/route.ts) + /design 컴포넌트 쇼케이스
src/components/
  ui/                       # shadcn 커스텀 컨트롤·오버레이 (button/select/dialog/sheet/toast …)
  primitives/               # empty-state, field, section-label, status-dot
  overlay/                  # portal(Portal/usePopoverCoords), global-command-palette
  discord/ layout/ data/ feedback/   # 도메인 뷰 조각
  servers/ player/ playlists/ home/ navbar/ …  # 화면별 컴포넌트
src/hooks/                  # use-playlists, use-guild-settings, use-debounce, use-bot-profile, use-member-greeting, use-count-up
src/lib/                    # auth, fetcher, api-guards, rate-limit, data-api, session-token, admin-ids,
                            # guild-permissions, shard-api, schemas, discord-cdn, redis, db … (23개)
src/store/                  # zustand (use-ui-store.ts, use-search-store.ts)
src/types/                  # 공용 타입
```

- 컴포넌트 계층/props는 **`ui-primitives` 스킬**을, 토큰은 **`design-tokens` 스킬**을 따른다.
- 상대 import는 `@/` 별칭 (`@/components/...`, `@/lib/...`).

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
<SWRConfig value={{ fetcher, revalidateOnFocus: false, dedupingInterval: 5000, errorRetryCount: 3 }}>
```

- 같은 파일(`Providers.tsx`)에 단일 `<Toaster />`가 마운트돼 있다 — **페이지별 ToastProvider/Toaster를 추가하지 말 것.**
- 피드백은 `toast.success/error/info/warning(...)` (`@/components/ui/toast`)로.

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
// ① 공용 게이트 (길드 권한) — 직접 canManage/auth()를 호출하지 않는다
import { authorizeGuildManage, deniedGuildManage } from "@/lib/api-guards";
// ② rate limit — 진입점에서 바로 반환
import { guardRateLimit, rateKey, WRITE_RATE } from "@/lib/rate-limit";

// ③ 스키마 (zod v4). 공용 스키마는 @/lib/schemas
const bodySchema = z.object({
	volume: z.number().int().min(0).max(100),
});

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;

	// ④ 권한: 세션 → accessToken → Discord 판정의 3상태 분기 (401 / 403 / 502)
	const authz = await authorizeGuildManage(id);
	if (!authz.ok) return deniedGuildManage(authz);   // 멤버 전용 라우트는 authorizeGuildMember + deniedGuildMember

	// ⑤ rate limit: 한도 초과면 429, 아니면 null
	const limited = await guardRateLimit(rateKey("settings-put", authz.userId, id), WRITE_RATE);
	if (limited) return limited;

	// ⑥ 입력 검증
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
	}

	try {
		// ⑦ 비즈니스 로직
		return NextResponse.json({ ok: true });
	} catch (error) {
		console.error("...", error);                       // 서버 로그에만
		return NextResponse.json({ error: "요청을 처리하지 못했어요." }, { status: 500 });
	}
}
```

### 공용 게이트 — `src/lib/api-guards.ts`

- `authorizeGuildManage(guildId)` / `authorizeGuildMember(guildId)` → `{ ok: true, token, userId } | { ok: false, status: 401|403|502 }`
  - 관리자 게이트는 DJ/제어 권한이 아니라 **길드 관리권**만 본다. 실제 제어 권한(DJ)은 봇이 판정한다.
  - `502` = Discord 확인 불가(429/5xx/네트워크) — 장애를 403으로 위장하지 않는다.
- `deniedGuildManage(authz)` / `deniedGuildMember(authz)`가 상태별 한국어 응답을 돌려준다 — 라우트에서 메시지를 다시 만들지 말 것.
- `authz.userId`는 rate limit 키에 쓴다. 세션·토큰 처리가 필요하면 `getSessionAccessToken()` (`src/lib/session-token.ts`)을 **서버에서만**.

### Rate limit — `src/lib/rate-limit.ts`

`guardRateLimit(rateKey(...), RULE)`이 표준 진입점 (31개 라우트 중 25개 사용).

| 규칙 | 한도 | 용도 |
| --- | --- | --- |
| `WRITE_RATE` | 12/min | 설정 변경 |
| `READ_RATE` | 30/min | Discord/data-api 읽기 |
| `HEAVY_WRITE_RATE` | 5/min | 무거운 쓰기(채널 생성 등) |
| `RENDER_RATE` | 60/min | 이미지 미리보기 렌더 |

- 구현: Redis 슬라이딩 윈도우(Lua) + `REDIS_URL` 미설정 시 인메모리 폴백, Redis 장애 시 **fail-open**.

### data-api 프록시 — `src/lib/data-api.ts`

Discord·봇에 직접 가는 대신 **data-api(Fastify) 경유**가 기본이다.

- env 계약: `DATA_API_URL` (기본 `http://localhost:3002`) + **`DATA_API_AUTH_KEY` 없으면 `AUTH_KEY` 폴백**. 대시보드 측 키가 없으면 호출 전면 스킵(null/503)이고, data-api는 키가 없으면 아예 기동을 거부(fail-closed)한다. `Authorization` 헤더는 `Bearer` 스킴 없이 **키 원문 그대로** 전송 (sha256 + timingSafeEqual 비교, `apps/data-api/src/plugins/auth.ts`).
- HTTP: `fetchDataApi` / `postDataApi` / `forwardDataApiGet` / `forwardDataApiPost` / `forwardDataApiImage` / `openDataApiStream` (`DATA_API_URL` + `DATA_API_AUTH_KEY`)
- request/reply 허브: `requestPlayerSearch` / `requestPlayerPlay` / `requestPlayerControl` / `fetchPlayerVoiceContext` / `requestJtcSetup`
- 캐시 무효화: `notifyGuildSettingsChanged`
- 채널·역할 조회(`/v1/guilds/:id/channels`, `/roles`)는 **Redis request/reply**다: data-api가 `sirubot:guild-data:request`를 발행하면 해당 길드를 보유한 봇 프로세스가 discord.js 캐시에서 읽어 `sirubot:guild-data:response`로 회신 (**3초 타임아웃**, 무응답 = 502 `bot_timeout`). 봇이 `REDIS_URL` 없이 memory-only로 부팅되거나 그 길드에 봇이 없으면 무조건 타임아웃이다. 사용자 토큰으로 Discord를 직접 호출하지 않는다.
- dashboard→data-api fetch 타임아웃: JSON 계열 10초, 이미지 렌더(`forwardDataApiImage`) 30초 (data-api 캔버스 렌더가 최대 ~20초라 여유분 포함). **SSE(`openDataApiStream`)에는 걸지 않는다** — AbortSignal.timeout이 장기 연결 스트림 전체를 끊기 때문. 신규 호출부를 추가할 때도 이 계약을 따른다.
- 실패 시 data-api의 한국어 메시지를 그대로 전달하고, 본문이 없으면 502로 감싼다.

실제 레퍼런스:

- 권한 게이트 + rate limit + data-api: `src/app/api/servers/[id]/channels/route.ts`
- 권한 게이트 + DB + PUT: `src/app/api/servers/[id]/settings/route.ts`
- zod 쿼리 검증(`z.coerce.number().int().min(1)`): `src/app/api/tracks/route.ts`
- 운영자 전용 인프라 API: `src/app/api/shards/route.ts` (`isDashboardAdmin` — `DASHBOARD_ADMIN_IDS` **fail-closed**, 미설정 시 전원 차단)
- 외부 서비스 토큰 전달: `src/lib/shard-api.ts` (`SHARD_MANAGER_URL` + `Authorization` 헤더, **서버 전용**)

컨벤션:

- 상태 변경은 **POST/PUT/PATCH/DELETE**, GET은 읽기 전용.
- 에러 메시지는 한국어(`{ error: string }`), 클라이언트에 내부 스택/에러 객체 전달 금지.
- 상태 코드: **401**(미인증) / **403**(권한 없음) / **400**(검증 실패) / **429**(rate limit) / **502**(Discord·봇·data-api 장애) / **500**.
- 클라이언트는 401을 받으면 `router.push("/api/auth/signin?callbackUrl=...")` (무한 리다이렉트 루프 금지 — `login/page.tsx` 주석 참고).

## 5. 인증 — next-auth v5 (`src/lib/auth.ts`)

```ts
export const { handlers, auth, signIn, signOut } = NextAuth({
	providers: [DiscordProvider({
		clientId: process.env.DISCORD_CLIENT_ID,          // 구 AUTH_DISCORD_ID 아님
		clientSecret: process.env.DISCORD_CLIENT_SECRET,  // 구 AUTH_DISCORD_SECRET 아님
		issuer: "https://discord.com",                    // 미설정 시 콜백이 Configuration 에러
		authorization: { params: { scope: "identify guilds" } },
	})],
	pages: { signIn: "/login", error: "/error" },
	session: { strategy: "jwt", maxAge: 24 * 60 * 60 },
	// callbacks: jwt에 accessToken/refreshToken 미러 저장 + DB 원본 갱신·재시도 쿨다운,
	//           session 콜백은 session.user.id만 노출
});
```

- **서버**(Route Handler / Server Component): `const session = await auth()`
- **클라이언트**: `useSession()` (`status === "loading" | "authenticated" | "unauthenticated"`)
- 미인증 리다이렉트: `router.push("/api/auth/signin?callbackUrl=/playlists")` 또는 링크 href를 그대로 지정 (`navbar.tsx`)
- 로그인/아웃: `signIn("discord")`, `signOut()`

### ⚠️ 보안 — Discord accessToken은 서버 전용

`session.accessToken`은 **노출되지 않는다** (session 콜백이 `user.id`만 설정). 코드에 `session.accessToken` / `data.accessToken` 사용처도 없다.

- 토큰이 필요하면 **서버에서만** `getSessionAccessToken()` (`src/lib/session-token.ts`)으로 읽는다.
  쿠키 2종(`__Secure-authjs.session-token` / `authjs.session-token`)을 시도하고 `AUTH_SECRET`을 쓴다.
- **클라이언트 컴포넌트에 전달/렌더링하지 않는다.** 토큰으로 Discord API를 호출하는 코드를 클라이언트에 두지 말 것.
- 토큰 수명·갱신(`token-store.ts`의 `ensureFreshToken`/`replaceTokenSet`)은 서버 콜백이 처리한다 — 클라이언트에서 만료를 재시도하지 않는다.
- 프로필 이미지·이름 등 필요한 데이터는 필요한 만큼만 클라이언트로 내려보낸다.
- 시크릿(`AUTH_SECRET`, `SHARD_MANAGER_AUTH_KEY`, `DATA_API_AUTH_KEY`, DB/Lavalink 비밀번호)은 항상 `process.env`로만 참조하며
  코드·클라이언트 번들(`NEXT_PUBLIC_` 제외)·로그에 남기지 않는다.

## 6. 클라이언트/서버 경계

- `"use client"` 최소화. 데이터가 필요하면 서버에서 `fetch` 후 프롭으로 전달.
- 클라이언트 컴포넌트에 **내부 주소·포트·엔드포인트 구조를 하드코딩하지 않는다**
  (예: `http://192.168.0.x:2333`) → 상대 경로 `/api/...` 또는 서버 Route를 경유.
- `next/image` 사용, 외부 호스트는 `next.config.ts` `remotePatterns` 등록 필요.

## 7. 보안 체크리스트 (PR 전 확인)

- [ ] 모든 Route Handler가 진입점에서 `authorizeGuildManage` / `authorizeGuildMember` 게이트 통과
- [ ] rate limit 진입점(`guardRateLimit`) 적용 — 쓰기 `WRITE_RATE`, 읽기 `READ_RATE`
- [ ] 인프라 노출 API(`/api/shards`, `/api/data-api`)에 `isDashboardAdmin` (fail-closed) 확인
- [ ] 클라이언트 번들에 시크릿·내부 주소·accessToken 없음 (`grep`으로 확인)
- [ ] 상태 변경 API는 메서드(POST/PUT/PATCH/DELETE) + zod 검증 + 범위 재검증(볼륨 0–100, URL 형식 등)
- [ ] Discord·봇 호출이 data-api 프록시(`@/lib/data-api`) 경유인지, 직접 호출이 아닌지
- [ ] 외부 응답(가사 등)·사용자 입력은 HTML이 아닌 텍스트로 렌더 (`dangerouslySetInnerHTML` 금지)

## 이렇게 하지 마세요 (금지)

```tsx
// ✗ 클라이언트에서 토큰 꺼내기 (session.accessToken은 노출되지도 않는다)
//    → 서버에서 getSessionAccessToken()으로만
fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: `Bearer ${data.accessToken}` } });

// ✗ 서버 URL 하드코딩
fetch("http://10.0.0.5:3001/api/shards");   // → lib/*.ts로 캡슐화 + process.env

// ✗ 검증 없는 body 사용
const { volume } = await request.json();     // → zod safeParse

// ✗ 직접 auth()/canManage() 호출로 권한 검증 흉내 내기 (api-guards 패턴 무시)

// ✗ 미인증 라우트 방치 / 클라이언트 권한 체크만으로 끝내기

// ✗ zustand에 API 데이터 보관, SWR 키를 컴포넌트마다 다르게 지정
```

## 검증 커맨드

```bash
yarn workspace @sirubot/dashboard lint        # eslint . --max-warnings=0
yarn workspace @sirubot/dashboard typecheck   # tsc --noEmit
yarn workspace @sirubot/dashboard dev         # 단일 앱 실행
```
