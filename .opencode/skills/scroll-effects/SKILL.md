---
name: scroll-effects
description: >
  대시보드(apps/dashboard) 스크롤 애니메이션 24종 치트시트: 등장(페이드/슬라이드/스태거/텍스트 리빌/
  마스크/블러/타이프라이터/카운트업), 스크롤 연동(패럴랙스/줌/시퀀스/SVG 드로우/텍스트 필/배경 전환/마키),
  고정·내비게이션(스티키/핀+스크럽/스크롤텔링/카드 스태킹/스크롤 스냅/가로 스크롤/숨겨지는 헤더/스크롤스파이).
  스크롤 애니메이션·모션 효과 요청 시 사용.
---

# Scroll Effects Skill

스크롤 애니메이션 24종을 **이 프로젝트에 이미 설치된 도구**로 구현하는 레시피다.
먼저 `dashboard-conventions`, `design-tokens` 스킬을 로드하고 작업한다.

## 목차

- [도구](#사용-가능한-도구-설치됨--새-패키지-금지)
- [1. 등장 애니메이션 (01–08)](#1-등장-애니메이션-0108)
- [2. 스크롤 연동 애니메이션 (09–16)](#2-스크롤-연동-애니메이션-0916)
- [3. 고정·스크롤·내비게이션 (17–24)](#3-고정스크롤내비게이션-1724)
- [공통 규칙](#공통-규칙)

## 사용 가능한 도구 (설치됨 — 새 패키지 금지)

| 도구 | 용도 | 비고 |
| --- | --- | --- |
| **CSS** (`globals.css` + Tailwind v4) | 스티키, 스크롤 스냅, 단순 hover/keyframes | JS 불필요한 경우 최우선 |
| **framer-motion** (`m` + `LazyMotion` + `MotionConfig reducedMotion="user"`) | 등장 애니메이션(`whileInView`), 스크롤 연동(`useScroll`/`useTransform`) | **`motion` import 금지 — `m`만 사용** (`Providers.tsx`에 LazyMotion 설정 완료) |
| **react-intersection-observer** (`useInView`) | 단순 뷰포트 진입 감지, 카운트업 트리거 | `track.tsx` 사용 예시 참고 |

- **GSAP / Lenis / locomotive-scroll 설치 금지.** 핀 고정·스크럽·가로 스크롤도 CSS + framer-motion `useScroll`/`useTransform`으로 구현한다 (아래 18/22 참조).
- 스타일은 **디자인 토큰만** 사용 (`bg-background`, `text-foreground`, `border-border`…). 하드코딩 hex 금지 (`design-tokens` 스킬 필독).
- 트랜지션 시간은 `duration-fast` / `duration-base` / `duration-slow` 토큰, 숫자형 `duration-200` 금지.
- **접근성 필수**: `prefers-reduced-motion` 전역 처리는 이미 되어 있으나(framer-motion `MotionConfig`로 자동 감지), JS 기반 커스텀 로직(타이머·인터섹션 기반)도 별도 체크할 것.

---

## 1. 등장 애니메이션 (01–08)

### 01. 페이드 인 (Scroll-triggered fade-in)

framer-motion `whileInView` 사용. 뷰포트에 들어오면 opacity 0→1.

```tsx
"use client";
import { m } from "framer-motion";

<m.div
	initial={{ opacity: 0 }}
	whileInView={{ opacity: 1 }}
	viewport={{ once: true, margin: "-80px" }}
	transition={{ duration: 0.6, ease: "easeOut" }}
	className="bg-card rounded-card border border-border p-6"
>
	<p className="text-foreground">카드 내용</p>
</m.div>
```

- `viewport={{ once: true }}`로 한 번만 실행해 재방문 시 깜빡임 방지.
- `margin`으로 트리거 지점 조정 (예: `-80px` = 뷰포트 80px 위에서 미리 시작).

### 02. 슬라이드 인 (Slide-in)

`y` (위→아래/아래→위) 또는 `x` 좌우 미끄러짐.

```tsx
<m.div
	initial={{ opacity: 0, x: -40 }}
	whileInView={{ opacity: 1, x: 0 }}
	viewport={{ once: true, margin: "-60px" }}
	transition={{ duration: 0.5, ease: "easeOut" }}
>
	…
</m.div>
```

### 03. 스태거 (Stagger)

부모에 `staggerChildren`, 자식은 자동 순차 시작. **레퍼런스: `features-section.tsx`** (`sectionVariants`).

```tsx
const container = { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } } as const;
const item = {
	hidden: { opacity: 0, y: 24 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
} as const;

<m.ul variants={container} initial="hidden" whileInView="visible" viewport={{ once: true }}>
	{items.map((it) => (
		<m.li key={it.id} variants={item} className="…">{it.name}</m.li>
	))}
</m.ul>
```

### 04. 텍스트 리빌 (Text reveal / Split text)

단어별/글자별 분할 후 `staggerChildren`.

```tsx
const words = text.split(" ");

<m.p variants={container} initial="hidden" whileInView="visible" viewport={{ once: true }} className="…">
	{words.map((w) => (
		<m.span
			key={w}
			variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
			className="inline-block"
		>
			{w}&nbsp;
		</m.span>
	))}
</m.p>
```

### 05. 마스크 리빌 (Clip-path reveal)

CSS-only로 충분. `clipPath` inset 애니메이션.

```tsx
<m.div
	initial={{ clipPath: "inset(0 100% 0 0)" }}
	whileInView={{ clipPath: "inset(0 0% 0 0)" }}
	viewport={{ once: true, margin: "-100px" }}
	transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
	className="overflow-hidden rounded-card"
>
	<Image src="…" alt="…" width={…} height={…} />
</m.div>
```

`ease-standard` 토큰과 동일 값(`cubic-bezier(.16,1,.3,1)`).

### 06. 블러 인 (Blur-in reveal)

```tsx
<m.div
	initial={{ opacity: 0, filter: "blur(8px)" }}
	whileInView={{ opacity: 1, filter: "blur(0px)" }}
	viewport={{ once: true }}
	transition={{ duration: 0.6 }}
>
	…
</m.div>
```

### 07. 타이프라이터 (Typewriter)

**기존 컴포넌트 준비됨** — 직접 만들지 말고 사용한다:

- `@/components/typing-text.tsx` (`TypingText`) — 한글 자소 분해(`@/lib/hangul`) 지원.
- `@/components/streaming-type-text.tsx` (`StreamingTypeText`) — 스트리밍 응답 스타일.

```tsx
import { TypingText } from "@/components/typing-text";

<TypingText texts={["첫 문장", "둘째 문장"]} speed={150} delay={2000} fit />
```

### 08. 카운트업 (Count-up)

`react-intersection-observer` + `requestAnimationFrame`. framer-motion의 `animate()`도 가능.

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

function CountUp({ end, suffix }: { end: number; suffix?: string }) {
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.4 });
	const [val, setVal] = useState(0);

	useEffect(() => {
		if (!inView) return;
		let raf = 0;
		const start = performance.now();
		const step = (t: number) => {
			const p = Math.min((t - start) / 1200, 1);
			setVal(Math.round(end * p));
			if (p < 1) raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [inView, end]);

	return (
		<span ref={ref} className="font-black tabular-nums text-primary">
			{val.toLocaleString()}{suffix}
		</span>
	);
}
```

---

## 2. 스크롤 연동 애니메이션 (09–16)

### 09. 스크롤 연동 (Scroll-linked)

`useScroll` + `useTransform`으로 스크롤 진행률을 애니메이션 값에 바인딩.

```tsx
import { m, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

function Section() {
	const ref = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
	const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.3, 1, 0.3]);

	return <m.div ref={ref} style={{ opacity }} className="min-h-[120vh]">…</m.div>;
}
```

### 10. 패럴랙스 (Parallax scrolling)

배경/전경을 다른 `y` 변환 속도로 이동.

```tsx
function ParallaxHero() {
	const ref = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
	const bgY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
	const fgY = useTransform(scrollYProgress, [0, 1], ["0%", "10%"]);

	return (
		<section ref={ref} className="relative h-screen overflow-hidden bg-background">
			<m.div style={{ y: bgY }} className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent" />
			<m.div style={{ y: fgY }} className="relative z-10 flex h-full items-center justify-center">
				<h1 className="text-title-gradient text-5xl font-black tracking-tighter">…</h1>
			</m.div>
		</section>
	);
}
```

### 11. 스크롤 줌 (Scale on scroll)

```tsx
const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1.1]);

<m.div ref={ref} className="overflow-hidden rounded-card">
	<m.img src="…" style={{ scale }} className="w-full h-auto" />
</m.div>
```

### 12. 이미지 시퀀스 (Scroll-scrubbed image sequence)

사전에 준비된 프레임들을 `useTransform`으로 index 매핑. **프로젝트에 기존 이미지 없으면 `public/images/scroll-sequence/` 같은 경로에 사전 로드 필요.** 구현 복잡도가 높으므로 사용자와 사양을 먼저 합의한다.

```tsx
const frame = useTransform(scrollYProgress, [0, 1], [0, FRAME_COUNT - 1]);
const src = useTransform(frame, (f) => `/images/scroll-sequence/frame-${String(Math.round(f)).padStart(4, "0")}.jpg`);

<m.img ref={ref} src={src.get()} alt="" />
```

### 13. SVG 라인 드로우 (SVG line drawing)

`pathLength`를 0→1. `scrollYProgress`로 연동.

```tsx
<m.path
	d="M10 50 Q 100 0 190 50"
	fill="none"
	stroke="currentColor"
	strokeWidth={2}
	className="text-primary"
	initial={{ pathLength: 0 }}
	whileInView={{ pathLength: 1 }}
	viewport={{ once: true, margin: "-100px" }}
	transition={{ duration: 1.5, ease: "easeInOut" }}
/>
```

스크롤 진행 연동: `style={{ pathLength: useTransform(scrollYProgress, [0, 1], [0, 1]) }}`.

### 14. 텍스트 필 (Text fill on scroll)

각 글자/단어의 `opacity`를 `scrollYProgress`에서 offset으로 분리.

```tsx
const words = longText.split(" ");

<div ref={ref} className="relative">
	<p>
		{words.map((w, i) => {
			const start = i / words.length;
			const end = (i + 1) / words.length;
			// eslint-disable-next-line react-hooks/rules-of-hooks
			const opacity = useTransform(scrollYProgress, [start, end], [0.15, 1]);
			return <m.span key={i} style={{ opacity }}>{w} </m.span>;
		})}
	</p>
</div>
```

> 훅 규칙 때문에 `words`가 고정 상수가 아니면 `useMemo`로 배열을 고정하거나, 별도 컴포넌트로 분리한다.

### 15. 배경색 트랜지션 (Background color transition)

스크롤 섹션 인덱스에 따라 `bg-background` 변화. framer-motion `backgroundColor` 또는 CSS transition.

```tsx
const bg = useTransform(scrollYProgress, [0, 0.5, 1], ["#fef5f9", "#ffe4f0", "#fef5f9"]);

<m.div style={{ backgroundColor: bg }} className="min-h-screen transition-colors duration-slow">…</m.div>
```

> **하드코딩 hex는 브랜드 토큰 없이는 금지**. 실제 사용 시 `bg-surface-1` / `bg-primary/10` 같은 토큰·opacity 변형으로 대체한다.

### 16. 마키 (Marquee / Scroll velocity)

CSS keyframe으로 무한 흐름 + `scrollYProgress`로 속도 조절은 복잡하므로, 보통 **CSS 무한 marquee만** 구현한다.

```tsx
// globals.css에 @keyframes marquee 등록해도 되고, tailwind 인라인도 가능.
<div className="overflow-hidden">
	<div className="flex gap-8 animate-[marquee_20s_linear_infinite]">
		{[...items, ...items].map((it, i) => <span key={i} className="text-foreground/60">{it}</span>)}
	</div>
</div>
```

---

## 3. 고정·스크롤·내비게이션 (17–24)

### 17. 스티키 (position: sticky)

CSS-only. 대시보드 섹션이 많은 페이지에서 유용.

```tsx
<section className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-8">
	<aside className="sticky top-24 self-start">
		<nav>…</nav>
	</aside>
	<div className="space-y-12">…</div>
</section>
```

- `top-24` = navbar(16 = 4rem) 아래에 붙게 조정. `scroll-mt-*`로 섹션 진입 위치도 맞춘다 (갤러리 사용 예시: `scroll-mt-28`).

### 18. 핀 고정 + 스크럽 (Pin + scrub)

GSAP 없이 CSS sticky + `useScroll`로 구현.

```tsx
function PinScrub() {
	const container = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ target: container, offset: ["start start", "end end"] });
	const x = useTransform(scrollYProgress, [0, 1], ["0%", "-60%"]);

	return (
		<div ref={container} className="relative h-[300vh]">
			<div className="sticky top-0 flex h-screen items-center overflow-hidden">
				<m.div style={{ x }} className="flex gap-8">
					{/* panels */}
				</m.div>
			</div>
		</div>
	);
}
```

### 19. 스크롤텔링 (Scrollytelling)

스티키 비주얼 + 긴 텍스트 스텝. 고정된 이미지/그래픽이 있고 텍스트 패시지가 지나갈 때마다 스테이트가 바뀌는 형태.

```tsx
function Scrollytelling({ steps }: { steps: Array<{ title: string; body: string; image: string }> }) {
	const [active, setActive] = useState(0);

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
			<div className="sticky top-0 h-screen flex items-center justify-center">
				<Image src={steps[active].image} alt="" width={600} height={400} className="rounded-card" />
			</div>
			<div>
				{steps.map((s, i) => (
					<StepTrigger key={i} onEnter={() => setActive(i)} className="min-h-screen flex flex-col justify-center">
						<h3 className="text-2xl font-black text-foreground">{s.title}</h3>
						<p className="text-muted-foreground">{s.body}</p>
					</StepTrigger>
				))}
			</div>
		</div>
	);
}
```

`StepTrigger`는 `useInView({ threshold: 0.5, onChange })`로 감싼다.

### 20. 카드 스태킹 (Stacking cards)

각 카드가 뷰포트에 `sticky`로 겹침. 카드 높이는 `calc(100vh - X)`로.

```tsx
const CARD_HEIGHT = "calc(100vh - 8rem)";

<div className="space-y-4">
	{cards.map((c, i) => (
		<div
			key={c.id}
			className="sticky bg-card rounded-card border border-border p-8 shadow-lg"
			style={{ top: `calc(4rem + ${i * 1.5}rem)`, height: CARD_HEIGHT }}
		>
			<h3 className="text-2xl font-black text-foreground">{c.title}</h3>
			<p className="text-muted-foreground">{c.body}</p>
		</div>
	))}
</div>
```

### 21. 스크롤 스냅 (CSS scroll snap)

CSS-only. 대시보드 전페이지보다는 **캐러셀/갤러리**에 적합.

```tsx
<div className="flex snap-x snap-mandatory overflow-x-auto custom-scrollbar">
	{items.map((it) => (
		<div key={it.id} className="snap-start shrink-0 w-[80vw] sm:w-[420px]">
			…
		</div>
	))}
</div>
```

> 페이지 전체 `snap-y snap-mandatory`는 navbar와 모바일에서 사용성이 떨어지므로 신중히 적용.

### 22. 가로 스크롤 (Horizontal scroll via vertical)

18번과 같은 패턴. 세로로 스크롤하는 동안 sticky로 고정하고 `x`를 변환.

```tsx
function HorizontalScroll() {
	const ref = useRef<HTMLDivElement>(null);
	const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
	const x = useTransform(scrollYProgress, [0, 1], ["0%", "-100%"]);

	return (
		<section ref={ref} className="relative h-[300vh]">
			<div className="sticky top-0 flex h-screen items-center overflow-hidden">
				<m.div style={{ x }} className="flex gap-6 px-8">
					{panels.map((p) => (
						<div key={p.id} className="w-[80vw] shrink-0 rounded-card bg-card border border-border p-8">
							…
						</div>
					))}
				</m.div>
			</div>
		</section>
	);
}
```

### 23. 숨겨지는 헤더 (Hide-on-scroll header)

스크롤 방향을 감지해 `transform: translateY(-100%)` 토글.

```tsx
"use client";
import { useEffect, useRef, useState } from "react";

function HideOnScrollHeader() {
	const [hidden, setHidden] = useState(false);
	const lastY = useRef(0);

	useEffect(() => {
		const onScroll = () => {
			const y = window.scrollY;
			setHidden(y > lastY.current && y > 80);
			lastY.current = y;
		};
		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, []);

	return (
		<header
			className={`fixed top-0 inset-x-0 z-50 bg-background transition-transform duration-base ${
				hidden ? "-translate-y-full" : "translate-y-0"
			}`}
		>
			…
		</header>
	);
}
```

### 24. 스크롤스파이 (Scrollspy)

**이미 구현됨: `apps/dashboard/src/app/components_gallery/page.tsx`** (L256–L277).
`getBoundingClientRect().top <= offset` 패턴으로 활성 섹션 계산. 재사용할 경우 그대로 복사.

```tsx
useEffect(() => {
	const handleScroll = () => {
		const sectionElements = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
		let activeId = SECTIONS[0].id;

		for (const el of sectionElements) {
			if (el.getBoundingClientRect().top <= 160) activeId = el.id;
		}
		setActiveSection(activeId);
	};

	window.addEventListener("scroll", handleScroll, { passive: true });
	setTimeout(handleScroll, 100);

	return () => window.removeEventListener("scroll", handleScroll);
}, []);
```

---

## 공통 규칙

- **`m` (LazyMotion) 사용 — `motion` import 금지**: `Providers.tsx`에서 `LazyMotion`으로 `domAnimation`만 로드하므로 `framer-motion`의 `motion.div`는 동작하지 않는다. **`m.div` 사용 + `import { m } from "framer-motion"`**이 프로젝트 표준.
- **`prefers-reduced-motion`**: `MotionConfig reducedMotion="user"`가 이미 설정되어 있어 framer-motion 애니메이션은 자동으로 줄어든다. 자바스크립트 타이머 기반(타이프라이터·카운트업)은 `useReducedMotion()` 훅으로 명시 분기 추천.
- **한국어 우선**: 사용자-facing 텍스트는 모두 한국어 (`dashboard-conventions` 참조).
- **하드코딩 금지**: 색상·간격·시간 토큰은 `design-tokens` 스킬의 유틸리티만 사용.

## 빠른 참조 — 어느 기술을 고를까

| 원하는 효과 | 1순위 | 2순위 |
| --- | --- | --- |
| 간단한 등장 | `whileInView` (framer) | `useInView` (r-io) |
| 스크롤 진행 연동 | `useScroll` + `useTransform` | — |
| 핀/가로 스크롤 | CSS `sticky` + `useScroll` | — |
| 무한 반복 텍스트 | CSS `@keyframes marquee` | — |
| 타이핑 | `TypingText` (기존) | — |
| 숫자 | `useInView` + rAF | framer `animate()` |
| 페이지 단위 스냅 | CSS `snap-y snap-mandatory` | — |
| 현재 섹션 강조 | gallery의 scrollspy 패턴 복사 | — |

## 검증

```bash
yarn workspace @sirubot/dashboard lint
yarn workspace @sirubot/dashboard typecheck
turbo dev --filter=@sirubot/dashboard
```
