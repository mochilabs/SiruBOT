# Next.js Server/Client Boundary & Hydration Audit

**대상**: `apps/dashboard` — Next.js 16.4.3 (App Router) · React 19.3.1 · next-auth 5.0.0-beta.32
**감사일**: 2026-10-24 · 워크트리: `feat/contributors-redesign-and-scroll-fix`
**방법**: 정찰 → 병렬 전문 감사 4에이전트(지시어·경계 / 런타임 스코프 / 하이드레이션 / 직렬화·보안) → 독립 검증 에이전트(라이브 콘솔 재현·라이브러리 소스 대조·반박) → 교차 조정. 소스 수정 없음.

---

## 1. Executive Summary

경계 설계는 전반적으로 건전하다. **Critical/High 위반 0건** — 클라이언트 그래프에 서버 전용 모듈(Prisma client 인스턴스, Redis, fs, 시크릿 env) 유입은 없었고, 46개 route handler가 `createGuildApiHandler` 게이트(auth→rate→zod→handler)를 100% 통일 사용하며, 서버→클라이언트 props는 전부 직렬화 가능 값(ISO 문자열 포함)만 전달한다.

확정 결함은 5건(검증 에이전트가 라이브 콘솔·라이브러리 소스로 승인): **하이드레이션 실패 1건(V1, reduced-motion 사용자의 홈 진입)**, **목록 상태 오염 1건(V5, 커스텀 명령어 편집기 index key)**, **metadata 전무 5라우트(V8)**, **에러 원문 노출 2곳(V6)**, **Prisma value import 1곳(V7)**. 1차 감사의 오픈 리다이렉트·TZ 불일치 후보 2건은 next-auth 기본 redirect 콜백 소스(`@auth/core/lib/init.js`)와 서버/브라우저 TZ 실측(KST=KST)으로 **반박**됐다.

## 2. Repository Architecture & Boundary Overview

| 레이어 | 구성 | 경계 상태 |
|---|---|---|
| 페이지 | 15개 `page.tsx` — 서버: contributors, design, licenses, login, player/[id], profile, servers/[id] · 클라이언트: shards, track, playlists, servers, invite(redirect) | 서버 페이지는 `auth()`·fetch 후 ISO/plain 값만 클라이언트로 전달 |
| API | `src/app/api/**` route handlers ~46개 | `createGuildApiHandler` 통일 게이트, `dataApiUserMessage`(한글-only 에러 필터) 계약 |
| Server Actions | `login/page.tsx` 인라인 1곳 | 공식 기법(클로저 자동 암호화, `$ACTION_1:2` RSA/AES hidden input 확인) |
| 라이브러리 경계 | `lib/auth.ts`·`token-store.ts`·`db.ts`(lazy Proxy)·`redis.ts`(globalThis 싱글턴)·`data-api/client.ts`(AUTH_KEY) | 전부 서버 전용, 클라이언트 체인 참조 0건 |
| 프로바이더 | `Providers.tsx`(SessionProvider+ThemeProvider+LazyMotion+SWRConfig) | `attribute="class"`·`defaultTheme="dark"`·persist 미사용 zustand → hydration 안전 |
| suppressHydrationWarning | `layout.tsx:71-72` 2곳뿐 | next-themes class 주입용 정당 (전체 조사) |

## 3~4. Findings (확정) — 심각도·카테고리별

### V1 [Medium·하이드레이션] `custom-command-preview.tsx:29-33` — 렌더 본체 `matchMedia` → reduced-motion 사용자 hydration 실패
- **증거**: `useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? DEMO_STEPS.length : -1)` + 렌더 본체 `prefersReducedMotion` 변수. 서버 렌더 `-1`/클라이언트(reduce) `DEMO_STEPS.length`로 첫 트리 분기.
- **라이브 재현**: Puppeteer `emulateMediaFeatures(reduce)`로 `/` 로드 → **React 19 "Hydration failed" 콘솔 에러 1건**, DOM `bg-discord-btn-active/70` vs `text-discord-text-muted` 분기 실증. reduce 끄면 에러 0건.
- **대조**: 형제 `player-preview.tsx:24`, `playlist-preview.tsx:30`은 `useReducedMotion()`(SSR=null, hydration-safe) 사용 — 이 파일만 raw `matchMedia`.
- **Verification: Confirmed (라이브)** · **수정**: `useReducedMotion()` + `useState(-1)` 고정, effect에서 reduce면 `setStep(DEMO_STEPS.length)`. · **테스트**: matchMedia true/false mock 초기 렌더 단언.

### V5 [Medium·상태 정합성] 커스텀 명령어 편집기 `key={index}` + move/remove
- **증거**: `custom-command-steps-editor.tsx:128`·`custom-command-designer.tsx:155` `key={index}`, `use-list-editor.ts` `removeItem`=`filter((_, i) => i !== index)`(index shift), `moveStep` 존재.
- **시나리오**: 중간 스텝 삭제 → 뒤 항목이 앞 index key 승계 → 입력 중 값·focus·Select 선택이 이웃 스텝으로 오염. hydration 위반은 아님(초기 렌더 동일) — **상태/포커스 유지 버그**.
- **Verification: Confirmed (정적, React reconciliation 규칙)** · **수정**: `createStep`/`createDesignItem`에 `crypto.randomUUID()` id 부여(이벤트 핸들러/초기 로드에서) → `key={step.id}`. · **테스트**: use-list-editor에 "중간 삭제 후 뒷 항목 state 무이동" 단언.

### V8 [Medium·아키텍처] shards/track/playlists/servers/invite 페이지 전면 `"use client"` → per-page metadata 전무
- **증거**: 5개 페이지 `page.tsx:1`이 전부 `"use client"` → `export const metadata` 불가(Next.js: metadata는 Server Component export 전용). grep 전수: metadata 존재 = contributors/licenses/player/[id] 등 3~4건뿐, 위 5라우트 0건. root layout(`layout.tsx:19`)에만 title "시루봇".
- **영향**: 탭 제목·공유 카드·SEO가 전부 동일. `playlists/page.tsx:183-185`는 같은 파일 클라이언트 컴포넌트를 Suspense로 감싸 스트리밍 효과도 없음.
- **Verification: Confirmed** · **수정**: page.tsx를 서버 래퍼(＋`export const metadata`)로, 내용을 `*-client.tsx`로 분리. · **테스트**: 라우트별 SSR `<title>` 스냅샷.

### V6 [Low·보안] storage upstream 실패 응답 원문 클라이언트 전달
- **증거**: `lib/storage.ts:76-83` `storageFailureMessage`가 `payload.error ?? payload.message` 원문을 `Error`로 throw → `assets/route.ts:103`·`assets/[assetId]/route.ts:75`가 `error.message`를 그대로 `{error}` JSON으로 반환.
- **대조**: `data-api/client.ts`의 `dataApiUserMessage`(한글 포함 시에만 원문, 그 외 폴백) 계약을 storage 계열은 미적용. 현재 `apps/storage` 응답이 전부 한국어라 실유출은 없으나, upstream 기술 원문(영문 `Route PUT:... not found` 등)이 반환되면 그대로 노출.
- **Verification: Confirmed (정적)** · **수정**: `storageFailureMessage`에 한글-only 필터(`/[가-힣]/`) 적용, 라우트 catch는 필터 통과값만 반환. · **테스트**: storage 응답이 영문 원문일 때 폴백 단언.

### V7 [Low·번들] `components/track.tsx:6` `@sirubot/prisma` value import
- **증거**: `import { Track as TrackType } from "@sirubot/prisma"`(value import, `"use client"` 파일). `packages/prisma/dist/index.js`는 top-level side effect(`exports.Prisma`, `Object.assign(exports, Prisma)`) 존재, `Track`은 런타임 미존재(타입 전용, `node -e` 확인). `isolatedModules` 하에서 value import는 제거 보장 없음 → Prisma 런타임 클라이언트 번들 유입 잠재.
- **Verification: Confirmed (정적)** · **수정**: `import type { Track as TrackType }` — 한 줄. · **테스트**: 빌드 후 클라이언트 청크에 `PrismaClient` 심볼 부재 grep.

### V9 [Info·데이터 최소화] `player/route.ts:20-24` `requestedById` 노출
- **증거**: `RecentEntry.requestedById: entry.userId`가 JSON 응답 포함, **소비 UI 0건**(player-client 인터페이스 선언만). 길드 멤버 권한만으로 타 멤버 Discord userId 조회 가능.
- **Verification: Confirmed (정적)** · **수정**: 필드 제거(사용처 0건이라 소비자 정리 불필요) 또는 `requesterLabel` 정규화 값으로 교체. · **테스트**: 응답 스키마에 `requestedById` 부재 단언.

## 5. 반박·하향 (검증 에이전트 판정)

| 후보 | 판정 | 근거 |
|---|---|---|
| login `signIn redirectTo` 오픈 리다이렉트 (A·D 보고) | **Refuted → Info** | `@auth/core/lib/init.js:13-18` default redirect 콜백: `url.startsWith("/")` → baseUrl 결합, 타 origin → **baseUrl 반환**. 앱은 `redirect` 콜백 override 없음(`auth.ts` jwt/session만). `callbackUrl=https://evil.example` → baseUrl로 치환됨. + `redirect()` 분기의 `startsWith("/")&&!startsWith("//")` 필터 병행(방어 유지 권장) |
| contributors 히트맵 title TZ 불일치 (C 보고) | **Downgraded (환경 의존)** | 서버 TZ=Asia/Seoul(`date`, `Intl` 실측) = 브라우저 TZ(KST) → 재현 불가. `/contributors` 로드 hydration 에러 0건. 배포 TZ이 달라지면 이슈 부활 가능 — 서버 포맷 prop 전달로 예방 권장 |
| profile `formatDay` TZ hydration (C 보고) | **Refuted → Info** | `formatDay`는 `ProfileView`(`"use client"`) 렌더 본체에서만 호출 → 첫 렌더부터 클라이언트 TZ 기준, 서버/클라이언트 불일치 발원지 아님 |
| login 인라인 action 클로저 직렬화 (A 보고) | **Refuted (적법)** | Next.js 공식 기법 — "Next.js automatically encrypts closed-over variables". SSR HTML `$ACTION_1:2`가 RSA/AES 암호문(200B)인 것 실측 확인 |
| `useSearchParams` CSR bailout (추가 탐색) | **Refuted** | `track/page.tsx`는 `<Suspense>` 감쌈, 나머지는 전부 클라이언트 전용 트리 |
| `new URL(request.url)` X-Forwarded-Host (추가 탐색) | **Refuted** | 7개 라우트 전부 searchParams 추출용만 사용, 절대 URL 생성 없음 |
| 서버→클라 함수/Symbol/클래스 props (추가 탐색) | **Refuted** | 0건. 서버 페이지는 string/boolean/plain 값만 전달 |
| `next/headers` 클라이언트 import (추가 탐색) | **Refuted** | `lib/session-token.ts`(서버) 1건뿐 |

**Clean 판정 항목**: `db.ts` lazy Proxy 프리즈마 싱글턴(좋은 설계), `guild-permissions` 캐시 userId:guildId 키+TTL(크로스유저 누출 없음), `rate-limit` 인메모리 폴백(MAX_BUCKETS 정리), HTML 중첩 전수조사(a>a·button>button·p>div 0건), recharts/cmdk 초기 렌더 미참여, `formatRelativeTimeFromISO`는 SWR 데이터 후에만 렌더(현재 안전 — SSR 프롭 경로에 얹으면 위반으로 전환되는 계약 주석 권장), `process-card.tsx:52` 정적 배열 key={i}(무해, key={item.label} 권장).

## 6. Recommended Remediation Order

1. **V1** — 1줄 패턴 전환(`useReducedMotion`), hydration 실패는 트리 전체 재생성(FOUC) 유발 — 실사용자 OS 설정 비율 고려 최우선.
2. **V5** — 데이터 오염 버그, 편집기 신뢰성 직결. `crypto.randomUUID()` id 부여.
3. **V8** — 서버 래퍼 격층 5라우트(번들 이점 동반: playlists는 react-virtual 모듈 경로 분리).
4. **V6** — storage 에러 필터 계약 적용.
5. **V7** — `import type` 한 줄.
6. **V9** — 필드 제거 여부 제품 판단(DJ 표시 의도면 유지).

## 7. Regression Test Plan

- `custom-command-preview.test.tsx`: matchMedia reduce true/false에서 초기 렌더 `step=-1` 단언 + hydration 스냅샷.
- `use-list-editor.test.tsx`: 중간 항목 삭제 후 뒷 항목 내부 state 무이동 단언(id key 전환 후).
- `storage.test.ts`·assets 라우트 테스트: 영문 원문 → 폴백 치환 단언.
- 라우트 `<title>` SSR 스냅샷(V8 후).
- `player/route` 응답 스키마(V9 판단 반영).
- CI TZ 가드: `TZ=America/New_York`로 히트맵/날짜 포맷 스냅샷(배포 TZ 다변화 대비).

## 8. Remaining Blind Spots & Untested Routes

- **인증 도메인 4라우트**(`/servers/[id]`, `/playlists`, `/player/[id]`, `/profile`): OAuth 세션 부재로 라이브 hydration·인터랙션 검증 불가 — V4·V9의 라이브 실측은 정적 리드로 대체됨. OAuth 테스트 세션 확보 시 재검증 권장.
- **V2(V10) OAuth 흐름**: 실제 submit 미실행(세션 오염 방지) — next-auth 소스 3단계 추적으로 판정.
- **프로덕션 빌드 빌드 산물**: V7의 번들 유입은 `yarn build`+bundle-analyzer 실측 전까지 잠재치로만 확정.
- **프로덕션 모드 전체**: 감사는 dev(webpack) 기준 — standalone 프로덕션(turbopack 빌드)에서 V1 재현·프리렌더 전 라우트 콘솔 스캔은 미실시.