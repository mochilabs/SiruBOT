import { describe, expect, it } from "vitest";

import { boxAtIndex, clamp, fractionalIndex, rubberBand } from "./tab-bar-math";

// 중심: 60 / 150 / 240
const boxes = [
	{ x: 20, width: 80 },
	{ x: 110, width: 80 },
	{ x: 200, width: 80 }
];

describe("clamp", () => {
	it("범위 안은 그대로, 밖은 끝값으로 붙여요", () => {
		expect(clamp(5, 0, 10)).toBe(5);
		expect(clamp(-3, 0, 10)).toBe(0);
		expect(clamp(30, 0, 10)).toBe(10);
	});
});

describe("rubberBand", () => {
	it("범위 안에서는 움직임을 그대로 반영해요", () => {
		expect(rubberBand(55, 20, 200)).toBe(55);
		expect(rubberBand(20, 20, 200)).toBe(20);
		expect(rubberBand(200, 20, 200)).toBe(200);
	});

	it("범위 밖은 저항비율만큼만 따라와요", () => {
		expect(rubberBand(210, 20, 200, 0.5, 100)).toBe(205);
		expect(rubberBand(10, 20, 200, 0.5, 100)).toBe(15);
	});

	it("아무리 끌어도 최대치에서 멈춰요", () => {
		expect(rubberBand(5000, 20, 200)).toBe(228);
		expect(rubberBand(-5000, 20, 200)).toBe(-8);
	});
});

describe("fractionalIndex", () => {
	it("탭 중심에 있으면 정수 인덱스를 줘요", () => {
		expect(fractionalIndex(boxes, 60)).toBe(0);
		expect(fractionalIndex(boxes, 150)).toBe(1);
		expect(fractionalIndex(boxes, 240)).toBe(2);
	});

	it("탭 사이를 선형으로 보간해요", () => {
		expect(fractionalIndex(boxes, 105)).toBeCloseTo(0.5);
		expect(fractionalIndex(boxes, 217.5)).toBeCloseTo(1.75);
	});

	it("양 끝 밖으로는 벗어나지 않아요", () => {
		expect(fractionalIndex(boxes, -100)).toBe(0);
		expect(fractionalIndex(boxes, 10000)).toBe(2);
		expect(fractionalIndex([], 100)).toBe(0);
	});
});

describe("boxAtIndex", () => {
	it("정수 인덱스에서는 해당 탭 box를 그대로 줘요", () => {
		expect(boxAtIndex(boxes, 0)).toEqual({ x: 20, width: 80 });
		expect(boxAtIndex(boxes, 2)).toEqual({ x: 200, width: 80 });
	});

	it("탭 사이에서는 x와 폭을 함께 라프해요", () => {
		const mid = boxAtIndex(boxes, 0.5);
		expect(mid.x).toBeCloseTo(65);
		expect(mid.width).toBeCloseTo(80);
		const uneven = boxAtIndex([{ x: 0, width: 40 }, { x: 100, width: 120 }], 0.25);
		expect(uneven.x).toBeCloseTo(25);
		expect(uneven.width).toBeCloseTo(60);
	});

	it("인덱스가 범위를 넘어서도 마지막 box 안에서 끝나요", () => {
		expect(boxAtIndex(boxes, -1)).toEqual({ x: 20, width: 80 });
		expect(boxAtIndex(boxes, 9)).toEqual({ x: 200, width: 80 });
		expect(boxAtIndex([], 0)).toEqual({ x: 0, width: 0 });
	});
});
