"use client";

import { Bold } from "lucide-react";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { GreetingLayer } from "@/types/member-greeting";

import { ColorField, radioArrowKeyDown } from "./color-input";
import { clampRatio } from "./greeting-draw";

const ALIGN_OPTIONS = [
	{ value: "left", label: "왼쪽" },
	{ value: "center", label: "가운데" },
	{ value: "right", label: "오른쪽" }
] as const;

const SHAPE_OPTIONS = [
	{ value: "rect", label: "사각형" },
	{ value: "circle", label: "원" }
] as const;

interface LayerPropertiesProps {
	layer: GreetingLayer | null;
	saving: boolean;
	onPatchLayer: (id: string, partial: Partial<GreetingLayer>) => void;
}

/** 선택된 레이어의 속성 편집 — 타입별 필드 + 공통 x/y */
export function LayerProperties({ layer, saving, onPatchLayer }: LayerPropertiesProps) {
	if (!layer) {
		return <p className="text-2xs text-muted-foreground">편집할 레이어를 선택하세요. 미리보기에서 레이어를 클릭하거나 왼쪽 목록에서 고를 수 있어요.</p>;
	}

	const patch = (partial: Partial<GreetingLayer>) => onPatchLayer(layer.id, partial);

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
				/>
			</div>
		</Field>
	);

	switch (layer.type) {
		case "text":
			return (
				<div className="space-y-4">
					{positionFields}
					<Field label="내용" description="변수({유저이름} 등)는 전송 시 채워져요.">
						<Input value={layer.text} maxLength={500} disabled={saving} onChange={(event) => patch({ text: event.target.value })} />
						<p className="pt-1 text-2xs text-muted-foreground">{layer.text.length}/500</p>
					</Field>
					<Field label="글자 크기">
						<Slider value={layer.size} min={12} max={160} label="글자 크기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(size) => patch({ size })} />
					</Field>
					<Field label="글자 색" description="프리셋이나 HEX(#RRGGBB)로 지정해요.">
						<ColorField value={layer.color} saving={saving} label="글자" onChange={(color) => patch({ color })} />
					</Field>
					<div className="flex flex-wrap items-center gap-4">
						<Button variant="state-toggle" active={layer.bold} icon={<Bold size={14} />} onClick={() => patch({ bold: !layer.bold })} disabled={saving} className="pointer-coarse:h-11">
							굵게
						</Button>
						<div role="radiogroup" aria-label="정렬" className="inline-flex rounded-control bg-input p-0.5">
							{ALIGN_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									role="radio"
									aria-checked={layer.align === option.value}
									onKeyDown={radioArrowKeyDown(ALIGN_OPTIONS.map((item) => item.value), layer.align, (key) => patch({ align: key as "left" | "center" | "right" }))}
									onClick={() => patch({ align: option.value })}
									className={cn(
										"pointer-coarse:min-h-9 cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
										layer.align === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
									)}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>
				</div>
			);
		case "avatar":
			return (
				<div className="space-y-4">
					{positionFields}
					<Field label="크기" description="아바타 지름이에요.">
						<Slider value={layer.size} min={40} max={600} label="아바타 크기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(size) => patch({ size })} />
					</Field>
					<Field label="링 색">
						<ColorField value={layer.ringColor} saving={saving} label="링" onChange={(color) => patch({ ringColor: color })} />
					</Field>
				</div>
			);
		case "image":
			return (
				<div className="space-y-4">
					{positionFields}
					<Field label="폭·높이 (px)" description="1200×675 카드 기준 실좌표예요.">
						<div className="flex items-center gap-2">
							<Input type="number" min={1} max={1200} step={1} value={layer.width} disabled={saving} aria-label="폭 (px)" onChange={(event) => {
								const width = event.currentTarget.valueAsNumber;
								if (Number.isFinite(width)) patch({ width: Math.min(1200, Math.max(1, width)) });
							}} />
							<Input type="number" min={1} max={675} step={1} value={layer.height} disabled={saving} aria-label="높이 (px)" onChange={(event) => {
								const height = event.currentTarget.valueAsNumber;
								if (Number.isFinite(height)) patch({ height: Math.min(675, Math.max(1, height)) });
							}} />
						</div>
					</Field>
					<Field label="투명도">
						<Slider value={layer.opacity} min={0} max={1} step={0.05} label="이미지 투명도" showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(opacity) => patch({ opacity })} />
					</Field>
				</div>
			);
		case "shape":
			return (
				<div className="space-y-4">
					{positionFields}
					<Field label="도형">
						<div role="radiogroup" aria-label="도형 종류" className="inline-flex rounded-control bg-input p-0.5">
							{SHAPE_OPTIONS.map((option) => (
								<button
									key={option.value}
									type="button"
									role="radio"
									aria-checked={layer.shape === option.value}
									onKeyDown={radioArrowKeyDown(SHAPE_OPTIONS.map((item) => item.value), layer.shape, (key) => patch({ shape: key as "rect" | "circle" }))}
									onClick={() => patch({ shape: option.value })}
									className={cn(
										"pointer-coarse:min-h-9 cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
							}} />
							<Input type="number" min={1} max={675} step={1} value={layer.height} disabled={saving} aria-label="높이 (px)" onChange={(event) => {
								const height = event.currentTarget.valueAsNumber;
								if (Number.isFinite(height)) patch({ height: Math.min(675, Math.max(1, height)) });
							}} />
						</div>
					</Field>
					<Field label="색">
						<ColorField value={layer.color} saving={saving} label="도형" onChange={(color) => patch({ color })} />
					</Field>
					<Field label="투명도">
						<Slider value={layer.opacity} min={0} max={1} step={0.05} label="도형 투명도" showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(opacity) => patch({ opacity })} />
					</Field>
				</div>
			);
	}
}
