"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Info } from "lucide-react";

import { Portal, usePopoverCoords } from "@/components/overlay/portal";

/**
 * 믹서 설정 설명 팝오버 — 갭리스/크로스페이드가 무엇을 하는지 파형 그래프 애니메이션으로 보여줘요.
 *
 * 모션 사유(R-19): 스윕하는 재생 헤드와 겹침 구간은 설정의 실제 동작(곡이 어떻게 이어지는지)을
 * 직접 시연하는 교육용 모션이에요. framer-motion은 MotionConfig reducedMotion="user"를 따라
 * 저사양 모드에서 자동으로 멈춰요. 파형 높이는 sin 합으로 결정적으로 만들어요(Math.random은
 * 하이드레이션 어긋남을 만들어요).
 */

const COPY = {
	gapless: {
		title: "갭리스 재생",
		description: "다음 곡을 미리 받아놓고, 현재 곡이 끝나는 순간 바로 틀어요. 곡이 바뀌는 사이의 짧은 공백이 사라져요.",
		caption: "크로스페이드를 함께 켜면 이어지는 지점이 겹쳐져요.",
		buttonLabel: "갭리스 재생 설명 보기",
	},
	crossfade: {
		title: "크로스페이드",
		description: "현재 곡이 끝나기 전에 다음 곡을 겹쳐 재생해요. 두 곡의 볼륨이 서로 교차하면서 자연스럽게 이어져요.",
		caption: "겹치는 길이는 아래 슬라이더로 조절해요.",
		buttonLabel: "크로스페이드 설명 보기",
	},
} as const;

export type MixerInfoKind = keyof typeof COPY;

/* 그래프 지오메트리: viewBox 240×56, 막대 32개 */
const GRAPH_W = 240;
const GRAPH_H = 56;
const BAR_COUNT = 32;
const BAR_PITCH = GRAPH_W / BAR_COUNT;
const BAR_WIDTH = 5;
const MID_Y = GRAPH_H / 2;
const MAX_AMP = MID_Y - 3;

/** 결정적 파형 — i마다 안정적으로 같은 높이(0.3..1) */
function barLevel(i: number): number {
	const wave = Math.sin(i * 1.7) + Math.sin(i * 0.43 + 1.2) * 0.6;
	return 0.3 + 0.7 * (0.5 + wave / 3.2);
}

function Bars({ from, to, envelope, className }: { from: number; to: number; envelope: (i: number) => number; className: string }) {
	return (
		<g className={className}>
			{Array.from({ length: BAR_COUNT }, (_, i) => {
				if (i < from || i > to) return null;
				const env = envelope(i);
				if (env <= 0.04) return null;
				const amp = MAX_AMP * barLevel(i) * env;
				return <rect key={i} x={i * BAR_PITCH + (BAR_PITCH - BAR_WIDTH) / 2} y={MID_Y - amp} width={BAR_WIDTH} height={amp * 2} rx={2.5} />;
			})}
		</g>
	);
}

/** 재생 헤드 스윕 — 그래프 폭을 3초에 한 바퀴 linear로 지나가요 */
function SweepLine() {
	return <m.div className="absolute inset-y-0 w-px bg-foreground/70" initial={false} animate={{ left: ["0%", "100%"] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} aria-hidden />;
}

function GraphFrame({ children }: { children: React.ReactNode }) {
	return (
		<div className="relative overflow-hidden rounded-card bg-surface-1">
			<svg viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`} className="block h-auto w-full" aria-hidden>
				{children}
			</svg>
			<SweepLine />
		</div>
	);
}

function GraphLegend({ center, centerTone }: { center: string; centerTone?: boolean }) {
	return (
		<div className="mt-1.5 flex items-center justify-between text-xs font-bold text-muted-foreground">
			<span className="flex items-center gap-1">
				<i className="h-1.5 w-1.5 rounded-full bg-primary-control" aria-hidden />
				현재 곡
			</span>
			<span className={centerTone ? "text-primary-text" : undefined}>{center}</span>
			<span className="flex items-center gap-1">
				다음 곡
				<i className="h-1.5 w-1.5 rounded-full bg-dot-neutral" aria-hidden />
			</span>
		</div>
	);
}

/** 크로스페이드 — 겹침 구간에서 현재 곡(핑크)은 줄어들고 다음 곡(회색)은 커져요 */
function CrossfadeGraph() {
	const FADE_BARS = 9;
	const fadeStart = 12;
	const aEnv = (i: number) => (i < fadeStart ? 1 : Math.max(0, 1 - (i - fadeStart + 1) / FADE_BARS));
	const bEnv = (i: number) => (i < fadeStart ? 0 : Math.min(1, (i - fadeStart + 1) / FADE_BARS));

	return (
		<GraphFrame>
			<rect x={fadeStart * BAR_PITCH} y={0} width={FADE_BARS * BAR_PITCH} height={GRAPH_H} className="fill-accent/30" />
			<Bars from={0} to={fadeStart + FADE_BARS} envelope={aEnv} className="fill-primary-control" />
			<Bars from={fadeStart} to={BAR_COUNT - 1} envelope={bEnv} className="fill-muted-foreground" />
		</GraphFrame>
	);
}

/** 갭리스 — 현재 곡과 다음 곡이 공백 없이 바로 맞닿아요 (이음선이 곡 경계) */
function GaplessGraph() {
	const seam = BAR_COUNT / 2;

	return (
		<GraphFrame>
			<Bars from={0} to={seam - 1} envelope={() => 1} className="fill-primary-control" />
			<Bars from={seam} to={BAR_COUNT - 1} envelope={() => 1} className="fill-muted-foreground" />
			<line x1={seam * BAR_PITCH - BAR_PITCH / 2} y1={4} x2={seam * BAR_PITCH - BAR_PITCH / 2} y2={GRAPH_H - 4} className="stroke-border-strong" strokeWidth={1.5} strokeDasharray="3 3" />
		</GraphFrame>
	);
}

const PANEL_WIDTH = 288; // w-72

/** 설정 라벨 옆 (i) — 누르면 파형 그래프 설명 팝오버가 떠요 */
export function MixerInfoTip({ kind }: { kind: MixerInfoKind }) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const coords = usePopoverCoords(triggerRef, open);
	const copy = COPY[kind];

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open]);

	// 오른쪽 화면 끝에서 잘리지 않게 좌측 위치를 클램프해요.
	const left = Math.min(coords.left, Math.max(8, coords.left + coords.rightSpace - PANEL_WIDTH - 8));

	return (
		<>
			<button
				ref={triggerRef}
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-label={open ? `${copy.title} 설명 닫기` : copy.buttonLabel}
				className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast hover:bg-surface-3 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
			>
				<Info size={14} aria-hidden />
			</button>

			<AnimatePresence>
				{open && coords.top > 0 && (
					<Portal>
						{/* 바깥 클릭용 투명 백드롭 — 스크롤은 막지 않아요(팝오버가 트리거를 따라가요) */}
						<div className="fixed inset-0 z-[190]" onClick={() => setOpen(false)} aria-hidden />
						<m.div
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="fixed z-[200] w-72 rounded-menu border-0 bg-popover p-3.5 shadow-2xl"
							style={{ top: coords.top + 8, left }}
							role="dialog"
							aria-label={`${copy.title} 설명`}
						>
							<p className="text-sm font-bold text-foreground">{copy.title}</p>
							<p className="mt-1 text-xs font-medium leading-relaxed text-muted-foreground">{copy.description}</p>
							<div className="mt-2.5">{kind === "crossfade" ? <CrossfadeGraph /> : <GaplessGraph />}</div>
							<GraphLegend center={kind === "crossfade" ? "겹치는 구간" : "공백 0초"} centerTone={kind === "crossfade"} />
							<p className="mt-1.5 text-sm text-muted-foreground">{copy.caption}</p>
						</m.div>
					</Portal>
				)}
			</AnimatePresence>
		</>
	);
}