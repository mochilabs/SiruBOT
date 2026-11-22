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

/** 봇 메시지 미리보기 — 디스코드 어두운/밝은 테마 배경 위에 강조선·진행바·아이콘이 어떻게 보이는지 보여줘요. */
function Preview({ color, tone }: { color: string; tone: "dark" | "light" }) {
	const dark = tone === "dark";
	return (
		<div className="rounded-control p-1.5" style={{ background: dark ? "#313338" : "#ffffff" }}>
			<div
				className="space-y-1.5 px-2.5 py-2"
				style={{
					background: dark ? "#2b2d31" : "#f2f3f5",
					borderLeft: `4px solid ${color}`,
					color: dark ? "#f2f3f5" : "#060607",
				}}
			>
				<div className="flex items-center gap-1.5 text-xs">
					<Play className="h-3.5 w-3.5" style={{ color }} aria-hidden />
					재생 중
					<Volume2 className="ml-auto h-3.5 w-3.5" style={{ color }} aria-hidden />
				</div>
				<div className="h-2 overflow-hidden rounded-full" style={{ background: dark ? "#4e5058" : "#d4d7dc" }}>
					<div className="h-full w-3/5 rounded-full" style={{ background: color }} />
				</div>
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
							"space-y-2 rounded-control border p-2.5 text-left transition-colors disabled:opacity-60",
							selected ? "border-2 border-foreground" : "border-border hover:border-border-strong",
						)}
					>
						<div className="flex items-center gap-2 text-sm font-semibold text-foreground">
							<span className="h-4 w-4 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
							{THEME_PRESET_LABELS[preset]}
							{selected && <Check className="ml-auto h-4 w-4" aria-hidden />}
						</div>
						<Preview color={color} tone="dark" />
						<Preview color={color} tone="light" />
					</button>
				);
			})}
		</div>
	);
}
