"use client";

import {
  GREETING_TEXT_WEIGHTS,
  type GreetingAvatarLayer,
  type GreetingAvatarShape,
  type GreetingGlow,
  type GreetingLayer,
  type GreetingShadow,
  type GreetingTextLayer,
  type GreetingTextOverflow,
  type GreetingTextWeight,
} from "@sirubot/utils/memberGreeting";

import { Field } from "@/components/primitives/field";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Slider } from "@/components/ui/slider";
import { cn, radioArrowKeyDown } from "@/lib/utils";

import { textWeight } from "./greeting-draw";

/** 속성 패널 한 줄짜리 선택지(라디오 그룹) — 키보드 방향키 이동을 지원해요 */
export function Segmented<T extends string | number>({
  label,
  options,
  value,
  disabled,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-control bg-input p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          onKeyDown={radioArrowKeyDown(
            options.map((item) => String(item.value)),
            String(value),
            (key) => {
              const next = options.find((item) => String(item.value) === key);
              if (next) onChange(next.value);
            },
          )}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer rounded-control px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
            value === option.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

const DEFAULT_SHADOW: GreetingShadow = { color: "#000000", opacity: 0.5, blur: 8, offsetX: 0, offsetY: 3 };
const DEFAULT_GLOW: GreetingGlow = { color: "#ffffff", opacity: 0.8, blur: 24, spread: 4 };

interface EffectProps<L extends GreetingLayer> {
  layer: L;
  saving: boolean;
  patch: (partial: Partial<L>) => void;
  patchAndCommit: (partial: Partial<L>) => void;
  onCommit: () => void;
}

/** 그림자 편집 — 색·투명도·흐림·오프셋 */
function ShadowEditor({
  shadow,
  label,
  saving,
  onChange,
  onCommit,
}: {
  shadow: GreetingShadow;
  label: string;
  saving: boolean;
  onChange: (shadow: GreetingShadow) => void;
  onCommit: () => void;
}) {
  return (
    <>
      <Field label={`${label} 색`}>
        <ColorPicker value={shadow.color} disabled={saving} label={label} onChange={(color) => onChange({ ...shadow, color })} onCommit={onCommit} />
      </Field>
      <Field label={`${label} 진하기`}>
        <Slider value={shadow.opacity} min={0} max={1} step={0.05} label={`${label} 진하기`} showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(opacity) => onChange({ ...shadow, opacity })} onCommit={onCommit} />
      </Field>
      <Field label={`${label} 흐림`}>
        <Slider value={shadow.blur} min={0} max={40} step={1} label={`${label} 흐림`} showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(blur) => onChange({ ...shadow, blur })} onCommit={onCommit} />
      </Field>
      <Field label={`${label} 위치`} description="오른쪽·아래쪽이 +예요.">
        <div className="space-y-2">
          <Slider value={shadow.offsetX} min={-40} max={40} step={1} label={`${label} 가로 위치`} showValue formatValue={(value) => `가로 ${value}px`} disabled={saving} onChange={(offsetX) => onChange({ ...shadow, offsetX })} onCommit={onCommit} />
          <Slider value={shadow.offsetY} min={-40} max={40} step={1} label={`${label} 세로 위치`} showValue formatValue={(value) => `세로 ${value}px`} disabled={saving} onChange={(offsetY) => onChange({ ...shadow, offsetY })} onCommit={onCommit} />
        </div>
      </Field>
    </>
  );
}

const WEIGHT_OPTIONS: readonly { value: GreetingTextWeight; label: string }[] = GREETING_TEXT_WEIGHTS.map((value) => ({
  value,
  label: { 400: "보통", 600: "중간", 700: "굵게", 900: "아주 굵게" }[value],
}));
const OVERFLOW_OPTIONS: readonly { value: GreetingTextOverflow; label: string }[] = [
  { value: "wrap", label: "줄바꿈" },
  { value: "ellipsis", label: "말줄임" },
];
type ShadowMode = "default" | "none" | "custom";
const SHADOW_MODES: readonly { value: ShadowMode; label: string }[] = [
  { value: "default", label: "기본" },
  { value: "none", label: "없음" },
  { value: "custom", label: "직접 설정" },
];

/** 텍스트 효과 — 굵기·간격·최대 폭·그림자·외곽선·그라디언트 */
export function TextEffectFields({ layer, saving, patch, patchAndCommit, onCommit }: EffectProps<GreetingTextLayer>) {
  const shadowMode: ShadowMode = layer.shadow === undefined ? "default" : layer.shadow === null ? "none" : "custom";
  const hasMaxWidth = layer.maxWidth !== undefined;
  const stroke = layer.stroke ?? null;
  const gradient = layer.gradient ?? null;
  return (
    <div className="space-y-4">
      <Field label="굵기">
        <Segmented
          label="글자 굵기"
          options={WEIGHT_OPTIONS}
          value={textWeight(layer) as GreetingTextWeight}
          disabled={saving}
          onChange={(weight) => patchAndCommit({ weight, bold: weight >= 700 })}
        />
      </Field>
      <Field label="글자 간격">
        <Slider value={layer.letterSpacing ?? 0} min={-10} max={60} step={1} label="글자 간격" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(letterSpacing) => patch({ letterSpacing })} onCommit={onCommit} />
      </Field>
      <Field label="줄 간격" description="여러 줄일 때 줄 사이 간격이에요. 기본 1.25배예요.">
        <Slider value={layer.lineHeight ?? 1.25} min={0.8} max={3} step={0.05} label="줄 간격" showValue formatValue={(value) => `${value.toFixed(2)}배`} disabled={saving} onChange={(lineHeight) => patch({ lineHeight })} onCommit={onCommit} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="state-toggle"
          active={hasMaxWidth}
          disabled={saving}
          onClick={() => patchAndCommit(hasMaxWidth ? { maxWidth: undefined, overflow: undefined, maxLines: undefined } : { maxWidth: 500, overflow: "wrap" })}
        >
          최대 폭 제한
        </Button>
        {hasMaxWidth ? <Segmented label="넘칠 때" options={OVERFLOW_OPTIONS} value={layer.overflow ?? "wrap"} disabled={saving} onChange={(overflow) => patchAndCommit({ overflow })} /> : null}
      </div>
      {hasMaxWidth ? (
        <>
          <Field label="최대 폭" description="이 폭을 넘으면 줄바꿈하거나 …으로 잘라요.">
            <Slider value={layer.maxWidth ?? 500} min={40} max={1200} step={10} label="최대 폭" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(maxWidth) => patch({ maxWidth })} onCommit={onCommit} />
          </Field>
          {(layer.overflow ?? "wrap") === "wrap" ? (
            <Field label="최대 줄 수" description="0이면 제한이 없어요. 넘치는 줄은 잘려요.">
              <Slider value={layer.maxLines ?? 0} min={0} max={10} step={1} label="최대 줄 수" showValue formatValue={(value) => (value === 0 ? "제한 없음" : `${value}줄`)} disabled={saving} onChange={(maxLines) => patch({ maxLines: maxLines === 0 ? undefined : maxLines })} onCommit={onCommit} />
            </Field>
          ) : null}
        </>
      ) : null}
      <Field label="그림자">
        <Segmented
          label="그림자 방식"
          options={SHADOW_MODES}
          value={shadowMode}
          disabled={saving}
          onChange={(mode) => patchAndCommit({ shadow: mode === "default" ? undefined : mode === "none" ? null : DEFAULT_SHADOW })}
        />
      </Field>
      {layer.shadow ? <ShadowEditor shadow={layer.shadow} label="그림자" saving={saving} onChange={(shadow) => patch({ shadow })} onCommit={onCommit} /> : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="state-toggle" active={stroke !== null} disabled={saving} onClick={() => patchAndCommit({ stroke: stroke ? null : { color: "#000000", width: 3 } })}>
          외곽선
        </Button>
        <Button
          variant="state-toggle"
          active={gradient !== null}
          disabled={saving}
          onClick={() => patchAndCommit({ gradient: gradient ? null : { to: "#ffd166", angle: 0 } })}
        >
          그라디언트 글자
        </Button>
      </div>
      {stroke ? (
        <>
          <Field label="외곽선 색">
            <ColorPicker value={stroke.color} disabled={saving} label="외곽선" onChange={(color) => patch({ stroke: { ...stroke, color } })} onCommit={onCommit} />
          </Field>
          <Field label="외곽선 두께">
            <Slider value={stroke.width} min={0} max={16} step={1} label="외곽선 두께" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(width) => patch({ stroke: { ...stroke, width } })} onCommit={onCommit} />
          </Field>
        </>
      ) : null}
      {gradient ? (
        <>
          <Field label="끝 색" description="시작 색은 위의 글자 색이에요.">
            <ColorPicker value={gradient.to} disabled={saving} label="그라디언트 끝" onChange={(to) => patch({ gradient: { ...gradient, to } })} onCommit={onCommit} />
          </Field>
          <Field label="그라디언트 방향" description="0°는 왼쪽→오른쪽, 90°는 위→아래예요.">
            <Slider value={gradient.angle ?? 0} min={0} max={360} step={5} label="글자 그라디언트 방향" showValue formatValue={(value) => `${value}°`} disabled={saving} onChange={(angle) => patch({ gradient: { ...gradient, angle } })} onCommit={onCommit} />
          </Field>
        </>
      ) : null}
    </div>
  );
}

const AVATAR_SHAPE_OPTIONS: readonly { value: GreetingAvatarShape; label: string }[] = [
  { value: "circle", label: "원" },
  { value: "rounded", label: "둥근 사각형" },
  { value: "square", label: "사각형" },
];

/** 아바타 옵션 — 모양·링 두께·그림자·글로우 */
export function AvatarEffectFields({ layer, saving, patch, patchAndCommit, onCommit }: EffectProps<GreetingAvatarLayer>) {
  const shape = layer.shape ?? "circle";
  return (
    <div className="space-y-4">
      <Field label="모양">
        <Segmented label="아바타 모양" options={AVATAR_SHAPE_OPTIONS} value={shape} disabled={saving} onChange={(next) => patchAndCommit({ shape: next })} />
      </Field>
      {shape === "rounded" ? (
        <Field label="모서리 둥글기" description="기본은 크기의 22%예요.">
          <Slider value={layer.cornerRadius ?? Math.round(layer.size * 0.22)} min={0} max={300} step={1} label="아바타 모서리 둥글기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(cornerRadius) => patch({ cornerRadius })} onCommit={onCommit} />
        </Field>
      ) : null}
      <Field label="링 두께" description="0이면 링이 없어요.">
        <Slider value={layer.ringWidth ?? 6} min={0} max={40} step={1} label="링 두께" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(ringWidth) => patch({ ringWidth })} onCommit={onCommit} />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="state-toggle" active={Boolean(layer.shadow)} disabled={saving} onClick={() => patchAndCommit({ shadow: layer.shadow ? null : DEFAULT_SHADOW })}>
          그림자
        </Button>
        <Button variant="state-toggle" active={Boolean(layer.glow)} disabled={saving} onClick={() => patchAndCommit({ glow: layer.glow ? null : DEFAULT_GLOW })}>
          글로우
        </Button>
      </div>
      {layer.shadow ? <ShadowEditor shadow={layer.shadow} label="그림자" saving={saving} onChange={(shadow) => patch({ shadow })} onCommit={onCommit} /> : null}
      {layer.glow ? (
        <>
          <Field label="글로우 색">
            <ColorPicker value={layer.glow.color} disabled={saving} label="글로우" onChange={(color) => patch({ glow: { ...layer.glow!, color } })} onCommit={onCommit} />
          </Field>
          <Field label="글로우 진하기">
            <Slider value={layer.glow.opacity} min={0} max={1} step={0.05} label="글로우 진하기" showValue formatValue={(value) => `${Math.round(value * 100)}%`} disabled={saving} onChange={(opacity) => patch({ glow: { ...layer.glow!, opacity } })} onCommit={onCommit} />
          </Field>
          <Field label="글로우 번짐">
            <Slider value={layer.glow.blur} min={0} max={80} step={1} label="글로우 번짐" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(blur) => patch({ glow: { ...layer.glow!, blur } })} onCommit={onCommit} />
          </Field>
          <Field label="글로우 크기">
            <Slider value={layer.glow.spread} min={0} max={40} step={1} label="글로우 크기" showValue formatValue={(value) => `${value}px`} disabled={saving} onChange={(spread) => patch({ glow: { ...layer.glow!, spread } })} onCommit={onCommit} />
          </Field>
        </>
      ) : null}
    </div>
  );
}
