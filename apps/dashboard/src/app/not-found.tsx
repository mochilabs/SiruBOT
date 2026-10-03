"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, m } from "framer-motion";
import { ChevronLeft, Home } from "lucide-react";

/** 뿌술 수 있는 머터리얼 도형 */
interface Shape {
	id: number;
	className: string;
	x: number;
	y: number;
	size: number;
}

const SHAPE_STYLES = [
	"rounded-xl bg-primary/10 rotate-12",
	"rounded-full bg-secondary/12",
	"rounded-lg bg-primary/12 -rotate-6",
	"rounded-2xl bg-secondary/10 rotate-45",
	"rounded-full bg-primary/8",
	"rounded-xl bg-secondary/8 -rotate-12",
] as const;

const TARGET_COUNT = 5;

function makeShapes(): Shape[] {
	const positions = [
		{ x: 8, y: 12 }, { x: 22, y: 55 }, { x: 38, y: 20 },
		{ x: 52, y: 60 }, { x: 66, y: 14 }, { x: 80, y: 45 },
		{ x: 14, y: 75 }, { x: 45, y: 82 }, { x: 72, y: 72 },
	];
	return positions.map((pos, index) => ({
		id: index,
		className: SHAPE_STYLES[index % SHAPE_STYLES.length],
		x: pos.x,
		y: pos.y,
		size: 40 + ((index * 17) % 36),
	}));
}

export default function NotFound() {
	const shapes = useMemo(makeShapes, []);
	const [popped, setPopped] = useState<number[]>([]);
	const found = popped.length >= TARGET_COUNT;

	useEffect(() => {
		if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		// 도형 자체는 CSS 부유 없이 정지 — 클릭 반응만 (과잉 애니메이션 방지)
	}, []);

	const pop = (id: number) => {
		if (popped.includes(id)) return;
		setPopped((prev) => [...prev, id]);
	};

	return (
		<main className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 sm:px-6 lg:px-8">
			{/* 거대 배경 텍스트 */}
			<div className="absolute inset-0 -z-10 flex items-center justify-center">
				<span className="select-none text-[16rem] font-black tracking-tighter text-primary/5 sm:text-[24rem] md:text-[30rem]">
					404
				</span>
			</div>

			{/* 머터리얼 도형 — 클릭하면 쪼개져요 */}
			<div aria-hidden className="pointer-events-none absolute inset-0">
				{shapes.map((shape) => (
					<div key={shape.id} className="absolute" style={{ left: `${shape.x}%`, top: `${shape.y}%` }}>
						<AnimatePresence>
							{!popped.includes(shape.id) ? (
								<m.button
									type="button"
									onClick={() => pop(shape.id)}
									exit={{ scale: [1, 1.3, 0], rotate: [0, 20, 40], opacity: [1, 1, 0] }}
									transition={{ duration: 0.4, ease: "easeOut" }}
									className={`pointer-events-auto cursor-pointer border-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${shape.className}`}
									style={{ width: shape.size, height: shape.size }}
									aria-hidden
									tabIndex={-1}
								/>
							) : null}
						</AnimatePresence>
					</div>
				))}
			</div>

			<div className="relative z-10 flex flex-col items-center text-center">
				<div className="space-y-8">
					{/* 카운터 — 도형을 찾으면 시루가 나타나요 */}
					<div className="flex h-24 w-24 items-center justify-center sm:h-32 sm:w-32">
						<AnimatePresence mode="wait">
							{found ? (
								<m.div
									key="siru"
									initial={{ scale: 0, rotate: -30 }}
									animate={{ scale: 1, rotate: 0 }}
									transition={{ type: "spring", stiffness: 260, damping: 16 }}
									className="relative h-24 w-24 sm:h-32 sm:w-32"
								>
									<Image src="/images/profile.png" alt="시루" fill className="rounded-full border border-border object-cover" sizes="128px" priority />
								</m.div>
							) : (
								<m.div
									key="counter"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									className="flex flex-col items-center gap-1"
								>
									<span className="text-3xl font-black tracking-tighter text-foreground sm:text-4xl">
										{popped.length}
										<span className="text-muted-foreground/40">/{TARGET_COUNT}</span>
									</span>
									<span className="text-2xs font-bold uppercase tracking-widest text-muted-foreground/60">도형을 건드려요</span>
								</m.div>
							)}
						</AnimatePresence>
					</div>

					<div className="space-y-3">
						<h1 className="text-4xl font-black tracking-tighter text-foreground break-keep sm:text-5xl md:text-6xl">
							{found ? "여기엔 없어요!" : "앗, 없는 주소예요"}
						</h1>
						<p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground/80 break-keep sm:text-lg">
							{found
								? "길은 제가 알아요. 홈으로 데려다줄게요."
								: "찾는 페이지가 여기에 없어요. 저기 흩어진 도형들을 건드려보는 건 어때요?"}
						</p>
					</div>

					<div className="flex flex-col items-center gap-4 pt-2">
						{found && (
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
							className="group flex items-center gap-1.5 text-sm font-medium text-muted-foreground/60 transition-colors duration-fast hover:text-foreground"
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