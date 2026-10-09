"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { m } from "framer-motion";
import { Bot, ChevronLeft, CloudSun, Gamepad2, Home, ListMusic, type LucideIcon,Music2, Sparkles } from "lucide-react";

/** 떨어뜨릴 수 있는 아이콘 — 봇 기능 아이콘들이 붕 떠 있어요 */
interface FloatingIcon {
	id: number;
	Icon: LucideIcon;
	tone: string;
	x: number;
	y: number;
	size: number;
}

const ICON_ITEMS: Array<{ Icon: LucideIcon; tone: string }> = [
	{ Icon: Music2, tone: "text-primary-text" },
	{ Icon: Bot, tone: "text-secondary/60" },
	{ Icon: ListMusic, tone: "text-primary-text" },
	{ Icon: CloudSun, tone: "text-secondary/50" },
	{ Icon: Gamepad2, tone: "text-primary-text" },
	{ Icon: Sparkles, tone: "text-secondary/60" },
];

function makeIcons(): FloatingIcon[] {
	const positions = [
		{ x: 10, y: 18 }, { x: 24, y: 62 }, { x: 38, y: 22 },
		{ x: 58, y: 66 }, { x: 70, y: 16 }, { x: 86, y: 48 },
	];
	return positions.map((pos, index) => ({
		id: index,
		...ICON_ITEMS[index % ICON_ITEMS.length],
		x: pos.x,
		y: pos.y,
		size: 26 + ((index * 13) % 18),
	}));
}

export default function NotFound() {
	const icons = useMemo(makeIcons, []);
	const [fallen, setFallen] = useState<number[]>([]);
	const [droppedAll, setDroppedAll] = useState(false);
	const viewport = useRef<{ h: number }>({ h: 900 });
	const reducedMotion = useRef(false);

	useEffect(() => {
		viewport.current = { h: window.innerHeight };
		reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}, []);

	const drop = (id: number) => {
		if (fallen.includes(id)) return;
		const next = fallen.length + 1;
		setFallen((prev) => [...prev, id]);
		if (next >= icons.length) setDroppedAll(true);
	};

	return (
		<main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
			{/* 거대 배경 텍스트 */}
			<div className="absolute inset-0 -z-10 flex items-center justify-center">
				<span className="select-none text-[16rem] font-black tracking-tighter text-primary/5 sm:text-[24rem] md:text-[30rem]">
					404
				</span>
			</div>

			{/* 떠 있는 아이콘 — 클릭하면 중력에 떨어져요 */}
			<div aria-hidden className="pointer-events-none absolute inset-0">
				{icons.map((icon) => (
					<div
						key={icon.id}
						className="absolute"
						style={{ left: `${icon.x}%`, top: `${icon.y}%`, width: icon.size, height: icon.size }}
					>
						{fallen.includes(icon.id) ? (
							<m.span
								className={`flex h-full w-full items-center justify-center ${icon.tone}`}
								initial={{ y: 0, opacity: 1 }}
								animate={
									reducedMotion.current
										? { opacity: 0, transition: { duration: 0.2 } }
										: { y: viewport.current.h, rotate: 120, opacity: [1, 1, 0], transition: { delay: (icon.id % 3) * 0.08, duration: 1, ease: "easeIn" } }
								}
							>
								<icon.Icon style={{ width: "100%", height: "100%" }} strokeWidth={2.4} />
							</m.span>
						) : (
							<m.button
								type="button"
								onClick={() => drop(icon.id)}
								whileHover={{ scale: 1.25 }}
								whileTap={{ scale: 0.85 }}
								className={`pointer-events-auto flex h-full w-full cursor-pointer items-center justify-center border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${icon.tone}`}
								aria-hidden
								tabIndex={-1}
							>
								<icon.Icon style={{ width: "100%", height: "100%" }} strokeWidth={2.4} />
							</m.button>
						)}
					</div>
				))}
			</div>

			<div className="relative z-10 flex flex-col items-center text-center">
				<div className="space-y-8">
					{/* 카운터 — 아이콘을 모두 떨어뜨리면 문구가 바뀌어요 */}
					<div className="flex h-12 items-center justify-center sm:h-14">
						{droppedAll ? (
							<m.span
								key="done"
								initial={{ scale: 0.8, opacity: 0 }}
								animate={{ scale: 1, opacity: 1 }}
								transition={{ type: "spring", stiffness: 260, damping: 16 }}
								className="text-3xl sm:text-4xl"
							>
								🎉
							</m.span>
						) : (
							<m.span key="counter" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-baseline gap-1.5">
								<span className="text-3xl font-black tracking-tighter text-foreground tabular-nums sm:text-4xl">
									{fallen.length}
									<span className="text-muted-foreground">/{icons.length}</span>
								</span>
								<span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">아이콘을 건드려요</span>
							</m.span>
						)}
					</div>

					<div className="space-y-3">
						<h1 className="text-4xl font-black tracking-tighter text-foreground break-keep sm:text-5xl md:text-6xl">
							{droppedAll ? "전부 떨어뜨렸네요!" : "앗, 없는 주소예요"}
						</h1>
						<p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground break-keep sm:text-lg">
							{droppedAll
								? "바닥도 깨끗해졌어요. 홈으로 데려다줄게요."
								: "찾는 페이지가 여기에 없어요. 저기 떠 있는 아이콘들을 건드려보는 건 어때요?"}
						</p>
					</div>

					<div className="flex flex-col items-center gap-4 pt-2">
						{droppedAll && (
							<m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
								<Link
									href="/"
									className="inline-flex h-11 items-center gap-3 rounded-control bg-primary px-8 text-base font-bold text-primary-foreground transition-colors duration-fast hover:bg-primary/90"
								>
									<Home className="h-5 w-5" aria-hidden />
									홈으로 가기
								</Link>
							</m.div>
						)}
						<button
							type="button"
							onClick={() => window.history.back()}
							className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground"
						>
							<ChevronLeft className="h-4 w-4 transition-transform duration-fast group-hover:-translate-x-0.5" aria-hidden />
							이전으로 가기
						</button>
					</div>
				</div>
			</div>
		</main>
	);
}