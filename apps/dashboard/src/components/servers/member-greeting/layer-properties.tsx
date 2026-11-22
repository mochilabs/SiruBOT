"use client";

import { GREETING_ANIMATION_MAX_MS, type GreetingAnimation, type GreetingAnimationKind, type GreetingLayer, type GreetingShapeKind } from "@sirubot/utils/memberGreeting";
import { Bold } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn, radioArrowKeyDown } from "@/lib/utils";

import { clampRatio } from "./greeting-draw";

const ALIGN_OPTIONS = [
	{ value: "left", label: "왼쪽" },
	{ value: "center", label: "가운데" },
	{ value: "right", label: "오른쪽" }
] as const;

const SHAPE_OPTIONS = [
	{ value: "rect", label: "사각형" },
	{ value: "circle", label: "원" },
	{ value: "triangle", label: "삼각형" },
	{ value: "diamond", label: "마름모" },
	{ value: "hexagon", label: "육각형" },
	{ value: "star", label: "별" },
	{ value: "heart", label: "하트" }
] as const;

const ANIMATION_OPTIONS: readonly { value: GreetingAnimationKind | "none"; label: string }[] = [
	{ value: "none", label: "없음" },
	{ value: "float", label: "둥실" },
	{ value: "drift", label: "이동" },
	{ value: "sway", label: "흔들림" },
	{ value: "spin", label: "회전" },
	{ value: "pulse", label: "커졌다 작아짐" },
	{ value: "twinkle", label: "깜빡임" }
];
const DEFAULT_ANIMATION: Omit<GreetingAnimation, "type"> = { durationMs: 2000, delayMs: 0, intensity: 0.5 };

interface LayerPropertiesProps {
	layer: GreetingLayer | null;
	saving: boolean;
	onPatchLayer: (id: string, partial: Partial<GreetingLayer>) => void;
	/** 편집 확정(되돌리기 한 단계) — 슬라이더는 값 확정, 입력 필드는 blur, 버튼은 클릭마다 호출해요 */
	onCommit: () => void;
}

/** 선택된 레이어의 속성 편집 — 타입별 필드 + 공통 x/y */
export function LayerProperties({ layer, saving, onPatchLayer, onCommit }: LayerPropertiesProps) {
	if (!layer) {
		return <p className="text-sm text-muted-foreground">편집할 레이어를 선택하세요. 미리보기에서 레이어를 클릭하거나 위 목록에서 고를 수 있어요.</p>;
	}

	const patch = (partial: Partial<GreetingLayer>) => onPatchLayer(layer.id, partial);
	// 단발 조작(버튼·라디오) — 패치와 함께 한 단계로 커밋해요
	const patchAndCommit = (partial: Partial<GreetingLayer>) => {
		patch(partial);
		onCommit();
	};

	const positionFields = (
		<Field label="가로·세로 위치 (%)" description="카드 왼쪽 위가 0%예요. 미리보기에서 드래그해도 돼요.">
			<div className="flex items-center gap-2">
				<Input
					type="number"
					min={0}
					max={100}
					step={1}
					value={layer.x}
					disabled={saving}
					aria-label="가로 위치 (%)"
					onChange={(event) => {
						const x = event.currentTarget.valueAsNumber;
						if (Number.isFinite(x)) patch({ x: clampRatio(x) });
					}}
					onBlur={onCommit}
				/>
				<Input
					type="number"
					min={0}
					max={100}
					step={1}
					value={layer.y}
					disabled={saving}
					aria-label="세로 위치 (%)"
					onChange={(event) => {
						const y = event.currentTarget.valueAsNumber;
						if (Number.isFinite(y)) patch({ y: clampRatio(y) });
					}}
					onBlur={onCommit}
				/>
			</div>
		</Field>
	);

	const rotationField = (
		<Field label="회전" description="시계 방향 각도예요. 0이면 회전하지 않아요.">
			<Slider
				value={layer.type === "avatar" ? 0 : (layer.rotation ?? 0)}
				min={-180}
				max={180}
				step={1}
				label="회전"
				showValue
				formatValue={(value) => `${value}°`}
				disabled={saving}
				onChange={(rotation) => patch({ rotation })}
				onCommit={onCommit}
			/>
		</Field>
	);

	const animation = layer.animation;
	const animationFields = (
		<div className="space-y-4">
			<Field label="움직임" description="움직이는 레이어가 하나라도 있으면 카드가 애니메이션 WebP로 전송돼요.">
				<div role="radiogroup" aria-label="움직임 종류" className="inline-flex flex-wrap rounded-control bg-input p-0.5">
					{ANIMATION_OPTIONS.map((option) => {
						const selected = (animation?.type ?? "none") === option.value;
						return (
							<button
								key={option.value}
								type="button"
								role="radio"
								aria-checked={selected}
								onKeyDown={radioArrowKeyDown(ANIMATION_OPTIONS.map((item) => item.value), animation?.type ?? "none", (key) =>
									patchAndCommit({ animation: key === "none" ? undefined : { ...DEFAULT_ANIMATION, ...animation, type: key as GreetingAnimationKind } })
								)}
								onClick={() => patchAndCommit({ animation: option.value === "none" ? undefined : { ...DEFAULT_ANIMATION, ...animation, type: option.value } })}
								className={cn(
									"cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
									selected ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
								)}
							>
								{option.label}
							</button>
						);
					})}
				</div>
			</Field>
			{animation ? (
				<>
					<Field label="한 번 움직이는 시간" description="레이어마다 달라도 돼요. 가장 긴 값이 카드 한 바퀴 길이고 다른 레이어는 그 길이에 맞춰져요.">
						<Slider value={animation.durationMs} min={500} max={GREETING_ANIMATION_MAX_MS} step={100} label="움직임 시간" showValue formatValue={(value) => `${(value / 1000).toFixed(1)}초`} disabled={saving} onChange={(durationMs) => patch({ animation: { ...animation, durationMs } })} onCommit={onCommit} />
					</Field>
					<Field label="시작 어긋남" description="레이어끼리 같이 움직이지 않게 엇갈리게 해요.">
						<Slider value={animation.delayMs} min={0} max={GREETING_ANIMATION_MAX_MS} step={100} label="시작 어긋남" showValue formatValue={(value) => `${(value / 1000).toFixed(1)}초`} disabled={saving} onChange={(delayMs) => patch({ animation: { ...animation, delayMs } })} onCommit={onCommit} />
					</Field>
					{animation.type !== "spin" ? (
						<Field label="세기">
							<Slider value={animation.intensity} min={0} max={1} step={0.05} label="움직임 세기" showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(intensity) => patch({ animation: { ...animation, intensity } })} onCommit={onCommit} />
						</Field>
					) : null}
				</>
			) : null}
		</div>
	);

	switch (layer.type) {
		case "text":
			return (
				<div className="space-y-4">
					{positionFields}
					{rotationField}
					<Field label="내용" description="변수({유저이름} 등)는 전송 시 채워져요.">
						<Input value={layer.text} maxLength={500} disabled={saving} onChange={(event) => patch({ text: event.target.value })} onBlur={onCommit} />
						<p className="pt-1 text-2xs text-muted-foreground">{layer.text.length}/500</p>
					</Field>
					<Field label="글자 크기">
						<Slider value={layer.size} min={12} max={160} label="글자 크기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(size) => patch({ size })} onCommit={onCommit} />
					</Field>
					<Field label="글자 색" description="팔레트·프리셋·HEX로 지정해요.">
						<ColorPicker value={layer.color} disabled={saving} label="글자" onChange={(color) => patch({ color })} onCommit={onCommit} />
					</Field>
					<div className="flex flex-wrap items-center gap-4">
						<Button variant="state-toggle" active={layer.bold} icon={<Bold size={14} />} onClick={() => patchAndCommit({ bold: !layer.bold })} disabled={saving}>
							굵게
						</Button>
						<div role="radiogroup" aria-label="정렬" className="inline-flex rounded-control bg-input p-0.5">
							{ALIGN_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									role="radio"
									aria-checked={layer.align === option.value}
									onKeyDown={radioArrowKeyDown(ALIGN_OPTIONS.map((item) => item.value), layer.align, (key) => patchAndCommit({ align: key as "left" | "center" | "right" }))}
									onClick={() => patchAndCommit({ align: option.value })}
									className={cn(
										"cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										layer.align === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>
					{animationFields}
				</div>
			);
		case "avatar":
			return (
				<div className="space-y-4">
					{positionFields}
					<Field label="크기" description="아바타 지름이에요.">
						<Slider value={layer.size} min={40} max={600} label="아바타 크기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(size) => patch({ size })} onCommit={onCommit} />
					</Field>
					<Field label="링 색">
						<ColorPicker value={layer.ringColor} disabled={saving} label="링" onChange={(color) => patch({ ringColor: color })} onCommit={onCommit} />
					</Field>
					{animationFields}
				</div>
			);
		case "image":
			return (
				<div className="space-y-4">
					{positionFields}
					{rotationField}
					<Field label="폭·높이 (px)" description="1200×675 카드 기준 실좌표예요.">
						<div className="flex items-center gap-2">
							<Input type="number" min={1} max={1200} step={1} value={layer.width} disabled={saving} aria-label="폭 (px)" onChange={(event) => {
								const width = event.currentTarget.valueAsNumber;
								if (Number.isFinite(width)) patch({ width: Math.min(1200, Math.max(1, width)) });
							}} onBlur={onCommit} />
							<Input type="number" min={1} max={675} step={1} value={layer.height} disabled={saving} aria-label="높이 (px)" onChange={(event) => {
								const height = event.currentTarget.valueAsNumber;
								if (Number.isFinite(height)) patch({ height: Math.min(675, Math.max(1, height)) });
							}} onBlur={onCommit} />
						</div>
					</Field>
					<Field label="투명도">
						<Slider value={layer.opacity} min={0} max={1} step={0.05} label="이미지 투명도" showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(opacity) => patch({ opacity })} onCommit={onCommit} />
					</Field>
					{animationFields}
				</div>
			);
		case "shape": {
			const gradient = Boolean(layer.gradientTo);
			const stroke = Boolean(layer.strokeColor);
			const filled = layer.filled !== false;
			return (
				<div className="space-y-4">
					{positionFields}
					{rotationField}
					<Field label="도형">
						<div role="radiogroup" aria-label="도형 종류" className="inline-flex flex-wrap rounded-control bg-input p-0.5">
							{SHAPE_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									role="radio"
									aria-checked={layer.shape === option.value}
									onKeyDown={radioArrowKeyDown(SHAPE_OPTIONS.map((item) => item.value), layer.shape, (key) => patchAndCommit({ shape: key as GreetingShapeKind }))}
									onClick={() => patchAndCommit({ shape: option.value })}
									className={cn(
										"cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										layer.shape === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</Field>
					<Field label="폭·높이 (px)">
						<div className="flex items-center gap-2">
							<Input type="number" min={1} max={1200} step={1} value={layer.width} disabled={saving} aria-label="폭 (px)" onChange={(event) => {
								const width = event.currentTarget.valueAsNumber;
								if (Number.isFinite(width)) patch({ width: Math.min(1200, Math.max(1, width)) });
							}} onBlur={onCommit} />
							<Input type="number" min={1} max={1200} step={1} value={layer.height} disabled={saving} aria-label="높이 (px)" onChange={(event) => {
								const height = event.currentTarget.valueAsNumber;
								if (Number.isFinite(height)) patch({ height: Math.min(1200, Math.max(1, height)) });
							}} onBlur={onCommit} />
						</div>
					</Field>
					{layer.shape === "rect" ? (
						<Field label="모서리 둥글기" description="사각형 모서리를 둥글게 해요.">
							<Slider value={layer.radius ?? 0} min={0} max={300} step={1} label="모서리 둥글기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(radius) => patch({ radius })} onCommit={onCommit} />
						</Field>
					) : null}
					<div className="flex flex-wrap items-center gap-4">
						<Button variant="state-toggle" active={filled} onClick={() => patchAndCommit({ filled: !filled })} disabled={saving}>
							안쪽 채우기
						</Button>
						<Button
							variant="state-toggle"
							active={gradient}
							onClick={() => patchAndCommit({ gradientTo: gradient ? null : "#b9a3ff", gradientAngle: layer.gradientAngle ?? 45 })}
							disabled={saving}
						>
							그라디언트
						</Button>
						<Button
							variant="state-toggle"
							active={stroke}
							onClick={() => patchAndCommit(stroke ? { strokeColor: null } : { strokeColor: "#ffffff", strokeWidth: layer.strokeWidth || 4 })}
							disabled={saving}
						>
							테두리
						</Button>
					</div>
					<Field label={gradient ? "시작 색" : "색"}>
						<ColorPicker value={layer.color} disabled={saving} label="도형" onChange={(color) => patch({ color })} onCommit={onCommit} />
					</Field>
					{gradient && layer.gradientTo ? (
						<>
							<Field label="끝 색">
								<ColorPicker value={layer.gradientTo} disabled={saving} label="그라디언트 끝" onChange={(gradientTo) => patch({ gradientTo })} onCommit={onCommit} />
							</Field>
							<Field label="그라디언트 방향" description="0°는 왼쪽→오른쪽, 90°는 위→아래예요.">
								<Slider value={layer.gradientAngle ?? 45} min={0} max={360} step={5} label="그라디언트 방향" showValue formatValue={(value) => `${value}°`} disabled={saving} onChange={(gradientAngle) => patch({ gradientAngle })} onCommit={onCommit} />
							</Field>
						</>
					) : null}
					{stroke && layer.strokeColor ? (
						<>
							<Field label="테두리 색">
								<ColorPicker value={layer.strokeColor} disabled={saving} label="테두리" onChange={(strokeColor) => patch({ strokeColor })} onCommit={onCommit} />
							</Field>
							<Field label="테두리 두께">
								<Slider value={layer.strokeWidth ?? 4} min={1} max={40} step={1} label="테두리 두께" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(strokeWidth) => patch({ strokeWidth })} onCommit={onCommit} />
							</Field>
						</>
					) : null}
					<Field label="투명도">
						<Slider value={layer.opacity} min={0} max={1} step={0.05} label="도형 투명도" showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(opacity) => patch({ opacity })} onCommit={onCommit} />
					</Field>
					<Field label="흐림 (글로우)" description="도형을 번지게 해서 빛 번짐처럼 써요.">
						<Slider value={layer.blur ?? 0} min={0} max={120} step={1} label="흐림" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(blur) => patch({ blur })} onCommit={onCommit} />
					</Field>
					{animationFields}
				</div>
			);
		}
	}
}
