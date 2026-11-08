"use client";

import { useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";
import { animate, m, useReducedMotion } from "framer-motion";

import { motionSlow } from "@/components/motion/durations";

/** 숫자가 0에서 목표값까지 올라가요 — reduced-motion이면 바로 목표값 */
function CountUp({ to, active }: { to: number; active: boolean }) {
	const shouldReduce = useReducedMotion();
	const [value, setValue] = useState(shouldReduce ? to : 0);
	useEffect(() => {
		if (!active) return undefined;
		if (shouldReduce) {
			setValue(to);
			return undefined;
		}
		const controls = animate(0, to, { duration: 0.8, ease: "easeOut", onUpdate: (latest) => setValue(Math.round(latest)) });
		return () => controls.stop();
	}, [active, to, shouldReduce]);
	return <span className="tabular-nums">{value}</span>;
}

function Row({ command, children }: { command: string; children: React.ReactNode }) {
	return (
		<m.li
			variants={{ hidden: { opacity: 0, x: -12 }, visible: { opacity: 1, x: 0, transition: { duration: motionSlow, ease: "easeOut" } } }}
			className="space-y-1.5"
		>
			<p className="text-xs">
				<span className="rounded-sm bg-discord-primary/20 px-1 text-discord-light">{command}</span>
			</p>
			<div className="rounded-control bg-surface-2/10 p-3 text-sm text-discord-text">{children}</div>
		</m.li>
	);
}

/**
 * 게임·생활 프리뷰 — 출석 스트릭, 주사위, 가위바위보, 택배 조회를 한 대화처럼 쌓아 보여줘요.
 * 날씨 카드는 히어로 데모에 이미 나와서 여기서는 빼요.
 * 출석 숫자는 카운트업, 나머지는 차례로 옆에서 들어와요.
 */
export function GamesLifePreview() {
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.3 });
	const shouldReduce = useReducedMotion();
	return (
		<div ref={ref} className="overflow-hidden rounded-card border border-border-subtle bg-discord-embed">
			<div className="flex items-center gap-2 border-b border-discord-btn-active px-4 py-2.5">
				<span className="text-xs font-semibold text-discord-text"># 수다방</span>
			</div>
			<m.ul
				className="space-y-4 p-4"
				variants={{ hidden: {}, visible: { transition: { staggerChildren: shouldReduce ? 0 : 0.25 } } }}
				initial="hidden"
				animate={inView ? "visible" : "hidden"}
			>
				<Row command="/출석">
					<strong className="font-semibold">서름</strong> 님, <strong className="font-semibold"><CountUp to={7} active={inView} />일 연속</strong> 출석 중이에요!
				</Row>
				<Row command="/주사위 개수:2">
					<span className="font-semibold">3 + 5 = 8</span>
				</Row>
				<Row command="/가위바위보">
					<span className="block">
						<strong className="font-semibold">서름</strong> 님: ✌️ 가위 · <strong className="font-semibold">봇</strong>: ✋ 보
					</span>
					<strong className="mt-1 block font-semibold">🎉 이겼어요!</strong>
				</Row>
				<Row command="/택배 택배사:CJ대한통운">
					<span className="block">
						<strong className="font-semibold">상태</strong>: 배달 출발
					</span>
					<span className="mt-1 block text-2xs text-discord-text-muted">출발 인천 HUB · 도착 서울 마포</span>
				</Row>
			</m.ul>
		</div>
	);
}
