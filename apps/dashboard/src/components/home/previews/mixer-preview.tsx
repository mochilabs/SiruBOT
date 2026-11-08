"use client";

import { useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { Mic, SlidersHorizontal } from "lucide-react";

import { motionBase } from "@/components/motion/durations";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** 필터 프리셋 표기 — 봇의 FILTER_PRESETS(베이스부스트·나이트코어·베이퍼웨이브·8D·노래방) 기준.
    나이트코어와 베이퍼웨이브는 속성이 겹쳐 실제로도 동시에 못 켜요 */
const FILTER_PRESETS = [
	{ name: "bassboost", label: "베이스부스트", exclusive: null },
	{ name: "nightcore", label: "나이트코어", exclusive: "speed" },
	{ name: "vaporwave", label: "베이퍼웨이브", exclusive: "speed" },
	{ name: "8d", label: "8D", exclusive: null },
	{ name: "karaoke", label: "노래방", exclusive: null }
] as const;

/**
 * 타임라인 기하(전체 폭 100 기준 %). 지금 곡 A가 0~62, 스폰서 구간이 32~44.
 * 크로스페이드를 켜면 다음 곡 B가 A의 끝과 겹쳐(54~62) 시작하고, 끄면 틈을 두고(66~) 시작해요.
 */
const SPONSOR = { left: 32, width: 12 } as const;
const A_END = 62;
const B_START_CROSSFADE = 54;
const B_START_PLAIN = 66;
const PLAYHEAD_LOOP_SECONDS = 8;

/** 파형 막대 수(밀도 1 기준) — 나이트코어는 촘촘하게, 베이퍼웨이브는 성글게 그려요 */
const WAVE_BARS_A = 34;
const WAVE_BARS_B = 24;

const mixerRow = "flex items-center justify-between gap-3 rounded-control bg-surface-1 px-3 py-2";

/** 결정적 파형 — 렌더마다 같은 모양이라 하이드레이션이 어긋나지 않아요(0.3~1) */
function waveBase(index: number, seed: number) {
	return 0.3 + 0.7 * Math.abs(Math.sin(index * 1.9 + seed) * Math.cos(index * 0.55 + seed * 0.5));
}

interface WaveformProps {
	count: number;
	seed: number;
	bass: boolean;
	karaoke: boolean;
	className?: string;
}

/**
 * 파형 한 줄 — 필터 상태를 막대 모양으로 보여줘요.
 * 베이스부스트: 진폭을 키우고 막대를 굵게. 노래방: 큰 봉우리(보컬 대역)를 깎아 평평하게.
 */
function Waveform({ count, seed, bass, karaoke, className }: WaveformProps) {
	return (
		<div className="flex h-full items-center justify-between" aria-hidden>
			{Array.from({ length: count }, (_, index) => {
				let level = waveBase(index, seed) * 0.62;
				if (bass) level = Math.min(1, level * 1.55);
				if (karaoke && level > 0.5) level = 0.38;
				return (
					<span
						key={index}
						className={cn("rounded-full transition-[height,width] duration-base ease-standard", bass ? "w-[3px]" : "w-0.5", className)}
						style={{ height: `${Math.round(level * 100)}%` }}
					/>
				);
			})}
		</div>
	);
}

/**
 * 믹서 프리뷰 — 토글과 필터가 타임라인을 직접 바꾸는 패널.
 * - 스폰서 스킵: 켜면 재생 헤드가 노란 스폰서 구간을 건너뛰고, 끄면 구간 위를 지나가요.
 * - 크로스페이드: 켜면 다음 곡이 현재 곡과 겹쳐 시작하고, 끄면 사이에 틈이 생겨요.
 * - TTS 겹침: 켜면 노래 위에 음성 말풍선 레인이 나타나요.
 * - 필터: 베이스부스트(파형 확대)·나이트코어(촘촘+빠르게)·베이퍼웨이브(성글게+느리게)·8D(켤 때 한 번 좌우 패닝)·노래방(봉우리 깎임).
 *   봇과 같은 배타 규칙(나이트코어 ↔ 베이퍼웨이브)을 따라요.
 */
export function MixerPreview() {
	const shouldReduce = useReducedMotion();
	const [sponsorSkip, setSponsorSkip] = useState(true);
	const [crossfade, setCrossfade] = useState(true);
	const [ttsOverlay, setTtsOverlay] = useState(false);
	const [activeFilters, setActiveFilters] = useState<string[]>(["bassboost"]);

	const has = (name: string) => activeFilters.includes(name);
	const bass = has("bassboost");
	const karaoke = has("karaoke");
	const pan8d = has("8d");
	const density = has("nightcore") ? 1.5 : has("vaporwave") ? 0.65 : 1;
	const loopSeconds = has("nightcore") ? PLAYHEAD_LOOP_SECONDS * 0.65 : has("vaporwave") ? PLAYHEAD_LOOP_SECONDS * 1.4 : PLAYHEAD_LOOP_SECONDS;

	const bStart = crossfade ? B_START_CROSSFADE : B_START_PLAIN;
	const sponsorEnd = SPONSOR.left + SPONSOR.width;

	// 재생 헤드 — 스킵이 켜져 있으면 스폰서 구간 앞에서 끝으로 빠르게 건너뛰어요.
	const playheadLeft = sponsorSkip ? ["0%", `${SPONSOR.left}%`, `${sponsorEnd}%`, "100%"] : ["0%", "100%"];
	const playheadTimes = sponsorSkip ? [0, SPONSOR.left / 100, SPONSOR.left / 100 + 0.01, 1] : [0, 1];

	const toggleFilter = (name: string, exclusive: string | null) => {
		setActiveFilters((current) => {
			if (current.includes(name)) return current.filter((active) => active !== name);
			const next = current.filter((active) => {
				const activePreset = FILTER_PRESETS.find((preset) => preset.name === active);
				if (!activePreset || !exclusive) return true;
				return activePreset.exclusive !== exclusive;
			});
			return [...next, name];
		});
	};

	return (
		<div className="space-y-2 rounded-card bg-surface-2 p-3 sm:p-4">
			<div className="flex items-center gap-2 px-1 pb-1">
				<SlidersHorizontal size={14} className="text-muted-foreground" aria-hidden />
				<p className="text-xs font-black tracking-tighter text-foreground">믹서</p>
			</div>

			{/* 타임라인 — 토글과 필터 상태가 그대로 그려져요 */}
			<div
				className="flex gap-2 rounded-control bg-surface-1 px-3 py-3"
				role="img"
				aria-label="재생 타임라인: 현재 곡과 다음 곡의 파형, 스폰서 구간, 크로스페이드 겹침, 선택한 필터 효과"
			>
				<div className="flex shrink-0 flex-col gap-1.5 text-2xs font-semibold text-muted-foreground" aria-hidden>
					<span className="flex h-6 items-center">지금 곡</span>
					<span className="flex h-6 items-center">다음 곡</span>
				</div>

				<div className="relative min-w-0 flex-1">
					<div className="relative h-6">
						<div className="absolute inset-y-0 left-0" style={{ width: `${A_END}%` }}>
							<Waveform key={`a-${density}`} count={Math.round(WAVE_BARS_A * density)} seed={1} bass={bass} karaoke={karaoke} className="bg-primary-control" />
						</div>
						<div
							className={cn(
								"absolute inset-y-0 rounded-control-inner transition-colors duration-base",
								sponsorSkip ? "border border-dashed border-warning bg-surface-1" : "bg-warning/40",
							)}
							style={{ left: `${SPONSOR.left}%`, width: `${SPONSOR.width}%` }}
						/>
					</div>

					<div className="relative mt-1.5 h-6">
						<div
							className="absolute inset-y-0 transition-[left,width] duration-base ease-standard"
							style={{ left: `${bStart}%`, width: `${100 - bStart}%` }}
						>
							<Waveform key={`b-${density}`} count={Math.round(WAVE_BARS_B * density)} seed={4} bass={bass} karaoke={karaoke} className="bg-primary-control/50" />
						</div>
					</div>

					{/* 크로스페이드 겹침 구간 — 두 곡이 함께 들리는 폭 */}
					<div
						aria-hidden
						className={cn(
							"pointer-events-none absolute -inset-y-1 rounded-control-inner border-x border-dashed border-foreground/50 bg-foreground/10 transition-opacity duration-base",
							crossfade ? "opacity-100" : "opacity-0",
						)}
						style={{ left: `${B_START_CROSSFADE}%`, width: `${A_END - B_START_CROSSFADE}%`, height: "calc(3.25rem + 0.5rem)" }}
					/>

					<AnimatePresence initial={false}>
						{ttsOverlay && (
							<m.div
								key="tts-lane"
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: motionBase, ease: "easeOut" }}
								className="overflow-hidden"
							>
								<div className="relative mt-1.5 h-6">
									<div className="absolute inset-y-0 flex items-center gap-1.5 rounded-control-inner bg-surface-2 px-2" style={{ left: "16%", width: "44%" }}>
										<Mic size={12} className="shrink-0 text-primary-text" aria-hidden />
										<span className="truncate text-2xs font-semibold text-foreground">후렴이에요!</span>
									</div>
								</div>
							</m.div>
						)}
						{pan8d && (
							<m.div
								key="pan-lane"
								initial={{ height: 0, opacity: 0 }}
								animate={{ height: "auto", opacity: 1 }}
								exit={{ height: 0, opacity: 0 }}
								transition={{ duration: motionBase, ease: "easeOut" }}
								className="overflow-hidden"
							>
								<div className="relative mt-1.5 flex h-6 items-center gap-1.5 text-2xs font-bold text-muted-foreground">
									<span aria-hidden>L</span>
									<div className="relative h-full flex-1">
										<div className="absolute inset-x-0 top-1/2 h-px bg-border-strong" />
										<m.span
											className="absolute top-1/2 -mt-1.5 -ml-1.5 h-3 w-3 rounded-full bg-primary-control"
											initial={{ left: "50%" }}
											// 켤 때 한 번만 좌우로 훑고 가운데에 멈춰요 — 반복 모션은 주변 애니메이션과 겹쳐 산만해요
											animate={shouldReduce ? undefined : { left: ["50%", "6%", "94%", "50%"] }}
											transition={{ duration: 1.8, ease: "easeInOut", times: [0, 0.3, 0.7, 1] }}
											style={shouldReduce ? { left: "50%" } : undefined}
										/>
									</div>
									<span aria-hidden>R</span>
								</div>
							</m.div>
						)}
					</AnimatePresence>

					{/* 재생 헤드 — 나이트코어는 빠르게, 베이퍼웨이브는 느리게 */}
					<m.div
						key={`playhead-${sponsorSkip}-${loopSeconds}`}
						aria-hidden
						className="pointer-events-none absolute -top-1 w-0.5 rounded-full bg-foreground"
						style={{ left: shouldReduce ? "20%" : "0%", height: "calc(3.25rem + 0.5rem)" }}
						animate={shouldReduce ? undefined : { left: playheadLeft }}
						transition={{ duration: loopSeconds, times: playheadTimes, ease: "linear", repeat: Infinity, repeatDelay: 0.8 }}
					/>
				</div>
			</div>

			<div className="space-y-1.5">
				<div className={mixerRow}>
					<p className="min-w-0 truncate text-sm font-medium text-foreground">스폰서 구간 자동 스킵</p>
					<Switch size="sm" checked={sponsorSkip} onChange={setSponsorSkip} aria-label="스폰서 구간 자동 스킵" />
				</div>
				<div className={mixerRow}>
					<p className="min-w-0 truncate text-sm font-medium text-foreground">크로스페이드</p>
					<Switch size="sm" checked={crossfade} onChange={setCrossfade} aria-label="크로스페이드" />
				</div>
				<div className={mixerRow}>
					<p className="min-w-0 truncate text-sm font-medium text-foreground">TTS 겹침</p>
					<Switch size="sm" checked={ttsOverlay} onChange={setTtsOverlay} aria-label="TTS 겹침" />
				</div>
			</div>

			<div className="rounded-control bg-surface-1 px-3 py-2.5">
				<p className="text-2xs font-medium text-muted-foreground">필터</p>
				<div className="mt-2 flex flex-wrap gap-1.5">
					{FILTER_PRESETS.map((preset) => (
						<button
							key={preset.name}
							type="button"
							aria-pressed={activeFilters.includes(preset.name)}
							onClick={() => toggleFilter(preset.name, preset.exclusive)}
							className={cn(
								"cursor-pointer rounded-control px-2.5 py-1 text-2xs font-bold transition-colors duration-fast",
								activeFilters.includes(preset.name)
									? "bg-primary-control text-primary-control-text"
									: "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground",
							)}
						>
							{preset.label}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
