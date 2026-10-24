"use client";

import { useState } from "react";
import { m } from "framer-motion";
import { Mic, SlidersHorizontal } from "lucide-react";

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

const mixerRow = "flex items-center justify-between gap-3 rounded-control bg-surface-1 px-3 py-2";

/**
 * 믹서 프리뷰 — 뮤직봇의 재생 디테일을 스위치로 직접 만져 보게 하는 패널.
 * 스폰서 스킵 토글은 진행 바의 광고 구간 표시를 즉시 바꾸고, TTS 겹침 상단에 말풍선이
 * 떠요. 필터 프리셋은 봇과 같은 배타 규칙(나이트코어 ↔ 베이퍼웨이브)을 따라요.
 */
export function MixerPreview() {
	const [sponsorSkip, setSponsorSkip] = useState(true);
	const [gapless, setGapless] = useState(true);
	const [crossfade, setCrossfade] = useState(true);
	const [ttsOverlay, setTtsOverlay] = useState(false);
	const [activeFilters, setActiveFilters] = useState<string[]>(["bassboost"]);

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
		<div className="max-w-md space-y-2 rounded-card bg-surface-2 p-3 sm:p-4">
			<div className="flex items-center gap-2 px-1 pb-1">
				<SlidersHorizontal size={14} className="text-muted-foreground" aria-hidden />
				<p className="text-xs font-black tracking-tighter text-foreground">믹서</p>
				<p className="ml-auto text-2xs text-muted-foreground">저장하면 봇에 적용돼요</p>
			</div>

			{/* 진행 바 — 스폰서 스킵 상태가 그대로 그려요: 켜면 구간이 비워 보이고, 끄면 재생 중 */}
			<div className="flex items-center gap-2 text-2xs tabular-nums text-muted-foreground">
				<span>0:43 / 4:40</span>
				<div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-1">
					<div className="absolute inset-y-0 left-0 w-[28%] rounded-full bg-primary-control" />
					{["18%", "52%", "79%"].map((left) => (
						<div key={left} className="absolute inset-y-0 w-px bg-muted-foreground/60" style={{ left }} />
					))}
					{/* 챕터 경계 사이의 스폰서 구간 대역 */}
					<div
						className={cn(
							"absolute inset-y-0 left-[35%] w-[9%] transition-colors duration-fast",
							sponsorSkip ? "border-x border-dashed border-warning/60" : "bg-warning/50",
						)}
					/>
				</div>
			</div>
			<p className="px-1 text-2xs text-muted-foreground">
				{sponsorSkip ? "스폰서 구간은 건너뛰고 이어서 재생해요." : "스폰서 구간도 그대로 재생 중이에요."}
			</p>

			{/* TTS 말풍선 자리 — 토글을 눌러도 행 높이가 그대로(밀림 없이 페이드만) */}
			<div className="px-1">
				<m.div
					animate={{ opacity: ttsOverlay ? 1 : 0 }}
					transition={{ duration: 0.2, ease: "easeOut" }}
					aria-hidden={!ttsOverlay}
					className="flex items-center gap-2 rounded-control bg-surface-1 px-2.5 py-1.5"
				>
					<Mic size={12} className="shrink-0 text-primary-text" aria-hidden />
					<p className="truncate text-2xs font-semibold text-foreground">
						<span className="text-muted-foreground">음성 겹침 ·</span> 다들 박수! 지금부터 후렴이에요!
					</p>
				</m.div>
			</div>

			<div className="space-y-1.5">
				<div className={mixerRow}>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">스폰서 구간 자동 스킵</p>
						<p className="text-2xs text-muted-foreground">광고 구간은 자동으로 건너뛰어요</p>
					</div>
					<Switch size="sm" checked={sponsorSkip} onChange={setSponsorSkip} aria-label="스폰서 구간 자동 스킵" />
				</div>
				<div className={mixerRow}>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">갭리스 재생</p>
						<p className="text-2xs text-muted-foreground">곡 이음새 없이 바로 이어요</p>
					</div>
					<Switch size="sm" checked={gapless} onChange={setGapless} aria-label="갭리스 재생" />
				</div>
				<div className={mixerRow}>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">크로스페이드</p>
						<p className="text-2xs text-muted-foreground">곡 사이를 4초로 부드럽게 이어요</p>
					</div>
					<Switch size="sm" checked={crossfade} onChange={setCrossfade} aria-label="크로스페이드" />
				</div>
				<div className={mixerRow}>
					<div className="min-w-0">
						<p className="truncate text-sm font-medium text-foreground">TTS 겹침</p>
						<p className="text-2xs text-muted-foreground">노래 위에 입력한 말을 얹어 전해요</p>
					</div>
					<Switch size="sm" checked={ttsOverlay} onChange={setTtsOverlay} aria-label="TTS 겹침" />
				</div>
			</div>

			<div className="rounded-control bg-surface-1 px-3 py-2.5">
				<p className="text-2xs font-medium text-muted-foreground">필터 프리셋 · 나이트코어와 베이퍼웨이브는 같이 못 켜요</p>
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

			<p className="px-1 text-2xs text-muted-foreground">채널에서도 /믹서 · /음악 필터 명령으로 같은 설정을 해요.</p>
		</div>
	);
}