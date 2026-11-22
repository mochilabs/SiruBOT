"use client";

import {
	THEME_PRESET_HEX,
	THEME_PRESET_LABELS,
	THEME_PRESETS,
	type ThemePreset,
} from "@sirubot/utils/guildSettingsContract";
import { Check, Pause, Play, SkipBack, SkipForward, Square, Volume2 } from "lucide-react";

import { cn, radioArrowKeyDown } from "@/lib/utils";

interface ThemePresetPickerProps {
	value: ThemePreset;
	disabled?: boolean;
	onChange: (preset: ThemePreset) => void;
}

/**
 * 봇 메시지 미리보기 — 디스코드 임베드 모양의 목업이에요. 배경·글자는 `--discord-*` 토큰이라 대시보드의 밝은/어두운
 * 테마를 따라가고, 프리셋 색(사용자가 고르는 강조색)만 값으로 칠해요.
 */
function Preview({ color }: { color: string }) {
	return (
		<div
			aria-hidden
			className="space-y-3 rounded-control-inner bg-discord-embed px-4 py-3.5 text-discord-text"
			style={{ borderLeft: `4px solid ${color}` }}
		>
			<div className="flex items-center gap-2 text-xs font-semibold">
				<Play className="h-4 w-4" style={{ color }} />
				재생 중
				<Volume2 className="ml-auto h-4 w-4" style={{ color }} />
			</div>
			<div>
				<p className="text-sm font-bold">곡 제목</p>
				<p className="text-2xs opacity-70">아티스트</p>
			</div>
			<div className="space-y-1">
				<div className="h-2 overflow-hidden rounded-full bg-discord-btn-active">
					<div className="h-full w-3/5 rounded-full" style={{ background: color }} />
				</div>
				<div className="flex justify-between text-2xs opacity-70">
					<span>1:48</span>
					<span>3:00</span>
				</div>
			</div>
			<div className="flex gap-2">
				{[SkipBack, Pause, SkipForward, Square].map((Icon) => (
					<span key={Icon.displayName ?? Icon.name} className="inline-flex h-8 w-9 items-center justify-center rounded-control-inner bg-discord-btn-active">
						<Icon className="h-4 w-4" style={{ color }} />
					</span>
				))}
			</div>
		</div>
	);
}

/** 봇 테마 선택기 — 색 칩 6개(라디오 그룹) + 고른 색을 적용한 미리보기 하나예요. */
export function ThemePresetPicker({ value, disabled = false, onChange }: ThemePresetPickerProps) {
	return (
		<div className="space-y-3">
			<div
				role="radiogroup"
				aria-label="봇 테마"
				className="grid grid-cols-3 gap-2 sm:grid-cols-6"
				onKeyDown={radioArrowKeyDown(THEME_PRESETS, value, (key) => onChange(key as ThemePreset))}
			>
				{THEME_PRESETS.map((preset) => {
					const color = THEME_PRESET_HEX[preset];
					const selected = preset === value;
					return (
						<button
							key={preset}
							type="button"
							role="radio"
							aria-checked={selected}
							tabIndex={selected ? 0 : -1}
							disabled={disabled}
							onClick={() => onChange(preset)}
							className={cn(
								"flex min-h-11 items-center justify-center gap-2 rounded-control bg-surface-2 px-2 py-2 text-sm font-semibold text-foreground shadow-control-boundary transition-control",
								"hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
								selected && "ring-2 ring-ring",
							)}
						>
							<span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: color }} aria-hidden>
								{selected && <Check className="h-3 w-3 text-black/70" />}
							</span>
							{THEME_PRESET_LABELS[preset]}
						</button>
					);
				})}
			</div>
			<Preview color={THEME_PRESET_HEX[value]} />
		</div>
	);
}
