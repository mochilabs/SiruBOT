import type { GreetingLayer } from "@sirubot/utils/memberGreeting";
import { afterEach, describe, expect, it } from "vitest";

import { appendWithinLimit, clearClipboard, cloneLayers, copyLayers, hasClipboard, MAX_GREETING_LAYERS, PASTE_OFFSET, pasteLayers } from "./greeting-clipboard";

const text = (id: string, x = 50, y = 50): GreetingLayer => ({ id, type: "text", x, y, size: 30, color: "#ffffff", bold: false, align: "center", text: id, shadow: { color: "#000000", opacity: 1, blur: 1, offsetX: 1, offsetY: 1 } });

let counter = 0;
const newId = () => `new-${++counter}`;

afterEach(() => {
  clearClipboard();
  counter = 0;
});

describe("cloneLayers", () => {
  it("새 id와 오프셋을 주고 중첩 값은 깊은 복사예요", () => {
    const source = text("a");
    const [copy] = cloneLayers([source], 1, newId);
    expect(copy).toMatchObject({ id: "new-1", x: 50 + PASTE_OFFSET.x, y: 50 + PASTE_OFFSET.y });
    (copy as Extract<GreetingLayer, { type: "text" }>).shadow!.blur = 99;
    expect((source as Extract<GreetingLayer, { type: "text" }>).shadow!.blur).toBe(1);
  });

  it("가장자리에서는 0~100 안으로 잡아요", () => {
    const [copy] = cloneLayers([text("a", 99, 99.5)], 3, newId);
    expect(copy!.x).toBe(100);
    expect(copy!.y).toBe(100);
  });
});

describe("복사·붙여넣기", () => {
  it("선택이 없으면 복사하지 않고 기존 클립보드를 남겨요", () => {
    expect(copyLayers([text("a")], [])).toBe(0);
    expect(hasClipboard()).toBe(false);
    copyLayers([text("a")], ["a"]);
    expect(copyLayers([text("a")], ["zzz"])).toBe(0);
    expect(hasClipboard()).toBe(true);
  });

  it("배열 순서를 지키고, 붙여넣을 때마다 오프셋이 한 칸씩 커져요", () => {
    copyLayers([text("a", 10, 10), text("b", 20, 20), text("c", 30, 30)], ["c", "a"]);
    const first = pasteLayers(newId);
    expect(first.map((layer) => layer.x)).toEqual([10 + PASTE_OFFSET.x, 30 + PASTE_OFFSET.x]);
    const second = pasteLayers(newId);
    expect(second.map((layer) => layer.x)).toEqual([10 + PASTE_OFFSET.x * 2, 30 + PASTE_OFFSET.x * 2]);
    expect(new Set([...first, ...second].map((layer) => layer.id)).size).toBe(4);
  });

  it("원본을 나중에 바꿔도 클립보드는 그대로예요", () => {
    const source = text("a");
    copyLayers([source], ["a"]);
    source.x = 1;
    expect(pasteLayers(newId)[0]!.x).toBe(50 + PASTE_OFFSET.x);
  });

  it("비어 있으면 빈 배열이에요", () => {
    expect(pasteLayers(newId)).toEqual([]);
  });
});

describe("appendWithinLimit", () => {
  it("스키마 상한(80)을 넘기지 않아요", () => {
    const existing = Array.from({ length: MAX_GREETING_LAYERS - 1 }, (_, index) => text(`e${index}`));
    const result = appendWithinLimit(existing, [text("x"), text("y")]);
    expect(result).toHaveLength(MAX_GREETING_LAYERS);
    expect(result.at(-1)!.id).toBe("x");
    expect(appendWithinLimit(result, [text("z")])).toHaveLength(MAX_GREETING_LAYERS);
  });
});
