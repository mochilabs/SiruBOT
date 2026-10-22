import { greetingPresetBackgroundPlan } from "@sirubot/utils/greetingCardDesign";
import { describe, expect, it } from "vitest";

import { CARD_H, CARD_W, drawPresetBackground } from "./greeting-draw";

// 프리셋 배경 색상 시퀀스 — data-api(memberGreetingCard.test.ts)가 같은 리터럴을 같은 순서로 비교해요.
// 양쪽 렌더러가 공용 계약(greetingCardDesign)의 계획을 같은 순서로 옮기므로, 두 파일의 동등성 오라클이 곧 좌우 렌더 결과의 동등성이에요.

/** 프리셋 3종 전수 기대 시퀀스 — 바닥색 → 대각 그라디언트 2스톱 → 코너 글로우 rgba 2스톱 → 스톱별 채우기 */
const PRESET_SEQUENCES: Record<string, string[]> = {
	rose: [
		"fillRect:#3d2328",
		"linear:0:#d1608a",
		"linear:1:#ff85c1",
		"fillRect:linear",
		"glow:0:rgba(255,228,240,0.2)",
		"glow:1:rgba(255,228,240,0)",
		"fillRect:glow"
	],
	plum: [
		"fillRect:#1a0e12",
		"linear:0:#231317",
		"linear:1:#4d2a35",
		"fillRect:linear",
		"glow:0:rgba(255,179,217,0.2)",
		"glow:1:rgba(255,179,217,0)",
		"fillRect:glow"
	],
	gold: [
		"fillRect:#231a10",
		"linear:0:#8a6a44",
		"linear:1:#d4a574",
		"fillRect:linear",
		"glow:0:rgba(240,226,207,0.2)",
		"glow:1:rgba(240,226,207,0)",
		"fillRect:glow"
	]
};

/** 배경 드로잉(canvas 호출)만 기록하는 mock 컨텍스트 — 프리셋 색상·기하 시퀀스 검증용 */
function recordingContext(): { ctx: CanvasRenderingContext2D; ops: string[]; geometry: { linear: number[] | null; radial: number[] | null } } {
	const ops: string[] = [];
	const geometry: { linear: number[] | null; radial: number[] | null } = { linear: null, radial: null };
	let fillStyle: string | { kind: string } = "";
	const gradient = (kind: string) => ({ kind, addColorStop: (offset: number, color: string) => ops.push(`${kind}:${offset}:${color}`) });
	const ctx = {
		get fillStyle(): string | { kind: string } {
			return fillStyle;
		},
		set fillStyle(value: string | { kind: string }) {
			fillStyle = value;
		},
		fillRect: () => ops.push(`fillRect:${typeof fillStyle === "string" ? fillStyle : fillStyle.kind}`),
		createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
			geometry.linear = [x0, y0, x1, y1];
			return gradient("linear");
		},
		createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
			geometry.radial = [x0, y0, r0, x1, y1, r1];
			return gradient("glow");
		}
	};
	return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, geometry };
}

describe("drawPresetBackground — 프리셋 배경 색상 시퀀스", () => {
	it("프리셋 3종 전수에서 계약의 색을 바닥→대각 그라디언트→코너 글로우 순서로 그려요", () => {
		for (const [presetId, expected] of Object.entries(PRESET_SEQUENCES)) {
			const { ctx, ops } = recordingContext();
			drawPresetBackground(ctx, greetingPresetBackgroundPlan(CARD_W, CARD_H, presetId));
			expect(ops).toEqual(expected);
		}
	});

	it("그라데이션 좌표·글로우 기하는 카드 1200×675 기준 계약값(좌하→우상, 우상단 코너)과 같아요", () => {
		const { ctx, geometry } = recordingContext();
		drawPresetBackground(ctx, greetingPresetBackgroundPlan(CARD_W, CARD_H, "rose"));
		expect(geometry.linear).toEqual([0, CARD_H, CARD_W, 0]);
		expect(geometry.radial).toEqual([CARD_W * 0.78, CARD_H * 0.22, 0, CARD_W * 0.78, CARD_H * 0.22, CARD_W * 0.55]);
	});
});
