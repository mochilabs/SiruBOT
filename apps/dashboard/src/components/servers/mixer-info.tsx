"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Info } from "lucide-react";

import { motionFast } from "@/components/motion/durations";
import { Portal, usePopoverCoords } from "@/components/overlay/portal";
import { Button } from "@/components/ui/button";

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

const GRAPH_W = 240;
const GRAPH_H = 56;
const BAR_COUNT = 32;
const BAR_PITCH = GRAPH_W / BAR_COUNT;
const BAR_WIDTH = 5;
const MID_Y = GRAPH_H / 2;
const MAX_AMP = MID_Y - 3;

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

const PANEL_WIDTH = 288;

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

	const left = Math.min(coords.left, Math.max(8, coords.left + coords.rightSpace - PANEL_WIDTH - 8));

	return (
		<>
			<Button
				ref={triggerRef}
				variant="icon"
				size="icon-xs"
				icon={<Info size={14} aria-hidden />}
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-label={open ? `${copy.title} 설명 닫기` : copy.buttonLabel}
			/>

			<AnimatePresence>
				{open && coords.top > 0 && (
					<Portal>
						<div className="fixed inset-0 z-(--z-overlay)" onClick={() => setOpen(false)} aria-hidden />
						<m.div
							initial={{ opacity: 0, y: -4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: motionFast, ease: "easeOut" }}
							className="fixed z-(--z-popover-high) w-72 rounded-menu border-0 bg-popover p-3.5 shadow-2xl"
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