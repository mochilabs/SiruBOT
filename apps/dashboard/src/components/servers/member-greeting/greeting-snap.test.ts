import { describe, expect, it } from "vitest";

import { boxesIntersect, boxFromPoints, snapBox, unionBox } from "./greeting-snap";

const CARD = { w: 1200, h: 675 };

describe("unionBox / boxFromPoints / boxesIntersect", () => {
  it("박스들을 감싸는 최소 박스를 구해요", () => {
    expect(unionBox([])).toBeNull();
    expect(unionBox([{ x: 10, y: 20, w: 30, h: 40 }, { x: 100, y: 0, w: 10, h: 10 }])).toEqual({ x: 10, y: 0, w: 100, h: 60 });
  });

  it("드래그 방향과 상관없이 사각형을 만들어요", () => {
    expect(boxFromPoints({ x: 50, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 40, h: 60 });
  });

  it("맞닿거나 겹치면 교차예요", () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(boxesIntersect(a, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
    expect(boxesIntersect(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });
});

describe("snapBox", () => {
  it("가운데가 카드 중앙선 근처면 정확히 중앙으로 붙고 세로 가이드를 줘요", () => {
    const result = snapBox({ x: 546, y: 100, w: 100, h: 50 }, [], CARD, 8);
    expect(result.dx).toBe(4);
    expect(result.guides).toContainEqual({ axis: "x", pos: 600, from: 0, to: 675 });
  });

  it("한계 밖이면 붙지 않아요", () => {
    const result = snapBox({ x: 480, y: 100, w: 100, h: 50 }, [], CARD, 8);
    expect(result.dx).toBe(0);
    expect(result.guides.filter((guide) => guide.axis === "x")).toHaveLength(0);
  });

  it("카드 가장자리에 붙어요 (왼쪽 가장자리·아래 가장자리)", () => {
    const result = snapBox({ x: 5, y: 620, w: 100, h: 50 }, [], CARD, 8);
    expect(result.dx).toBe(-5);
    expect(result.dy).toBe(5);
  });

  it("다른 레이어의 가장자리·가운데에 붙고, 가이드가 두 박스를 이어요", () => {
    const other = { x: 300, y: 400, w: 200, h: 100 };
    const result = snapBox({ x: 303, y: 50, w: 60, h: 60 }, [other], CARD, 8);
    expect(result.dx).toBe(-3);
    const guide = result.guides.find((item) => item.axis === "x" && item.pos === 300);
    expect(guide).toEqual({ axis: "x", pos: 300, from: 50, to: 500 });
  });

  it("두 축을 따로 붙여요", () => {
    const result = snapBox({ x: 552, y: 290, w: 100, h: 100 }, [], CARD, 8);
    expect(result.dx).toBe(-2);
    expect(result.dy).toBe(-2.5);
    expect(result.guides.map((guide) => guide.axis).sort()).toEqual(["x", "y"]);
  });

  it("가장 가까운 후보를 골라요", () => {
    const result = snapBox({ x: 106, y: 0, w: 20, h: 20 }, [{ x: 100, y: 300, w: 10, h: 10 }, { x: 105, y: 300, w: 10, h: 10 }], CARD, 8);
    expect(result.dx).toBe(-1);
  });
});
