"use client";

import {
	THEME_PRESET_HEX,
	THEME_PRESET_LABELS,
	THEME_PRESETS,
	type ThemePreset,
} from "@sirubot/utils/guildSettingsContract";
import { Check, Play, Volume2 } from "lucide-react";

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
			className="space-y-2 rounded-control bg-discord-embed px-3 py-2.5 text-discord-text"
			style={{ borderLeft: `4px solid ${color}` }}
		>
			<div className="flex items-center gap-2 text-2xs font-medium">
				<Play className="h-3.5 w-3.5" style={{ color }} aria-hidden />
				재생 중
				<Volume2 className="ml-auto h-3.5 w-3.5" style={{ color }} aria-hidden />
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-discord-btn-active">
				<div className="h-full w-3/5 rounded-full" style={{ background: color }} />
			</div>
		</div>
	);
}

/** 봇 테마 선택기 — 프리셋 6개를 미리보기 카드로 보여주는 라디오 그룹이에요. */
export function ThemePresetPicker({ value, disabled = false, onChange }: ThemePresetPickerProps) {
	return (
		<div
			role="radiogroup"
			aria-label="봇 테마"
			className="grid grid-cols-2 gap-3 sm:grid-cols-3"
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
							"space-y-2.5 rounded-card bg-surface-2 p-3 text-left shadow-control-boundary transition-control",
							"hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
							selected && "ring-2 ring-ring",
						)}
					>
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
							{THEME_PRESET_LABELS[preset]}
							{selected && <Check className="ml-auto h-4 w-4 text-primary-text" aria-hidden />}
						</div>
						<Preview color={color} />
					</button>
				);
			})}
		</div>
	);
}
