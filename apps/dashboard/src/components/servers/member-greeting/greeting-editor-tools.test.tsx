// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { GreetingAvatarLayer, GreetingImage, GreetingLayer, GreetingTextLayer } from "@sirubot/utils/memberGreeting";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { drawGreetingSelection, layerBounds } from "./greeting-draw";
import { LayerPanel } from "./layer-panel";
import { LayerProperties } from "./layer-properties";
import { useGreetingHistory } from "./use-greeting-history";
import { type GreetingShortcutActions, useGreetingShortcuts } from "./use-greeting-shortcuts";

const text: GreetingTextLayer = { id: "t", type: "text", x: 50, y: 50, size: 40, color: "#ffffff", bold: false, align: "center", text: "안녕하세요" };
const avatar: GreetingAvatarLayer = { id: "a", type: "avatar", x: 20, y: 20, size: 100, ringColor: "#ffffff" };

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

async function mount(node: React.ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => { root.render(node); });
  return { host, root };
}

function fakeCtx(): CanvasRenderingContext2D {
  let font = "";
  return {
    save() {}, restore() {},
    set font(value: string) { font = value; },
    get font() { return font; },
    measureText: (value: string) => ({ width: [...value].length * Number(/(\d+)px/.exec(font)?.[1] ?? 10) * 0.5 }),
  } as unknown as CanvasRenderingContext2D;
}

describe("layerBounds — 새 옵션 반영", () => {
  it("아바타는 ringWidth를 반영해요 (기본 6)", () => {
    expect(layerBounds(fakeCtx(), avatar).w).toBe(112);
    expect(layerBounds(fakeCtx(), { ...avatar, ringWidth: 0 }).w).toBe(100);
    expect(layerBounds(fakeCtx(), { ...avatar, ringWidth: 20 }).w).toBe(140);
  });

  it("텍스트는 글자 간격으로 넓어지고 maxWidth를 넘으면 줄바꿈으로 높이가 커져요", () => {
    const base = layerBounds(fakeCtx(), text);
    expect(base.w).toBe(5 * 20 + 16);
    expect(layerBounds(fakeCtx(), { ...text, letterSpacing: 10 }).w).toBe(base.w + 50);
    const wrapped = layerBounds(fakeCtx(), { ...text, maxWidth: 50, overflow: "wrap" });
    expect(wrapped.w).toBe(50 + 16);
    expect(wrapped.h).toBe(2 * 40 * 1.25 + 16);
    expect(layerBounds(fakeCtx(), { ...text, maxWidth: 50, overflow: "ellipsis" }).h).toBe(40 + 16);
    expect(layerBounds(fakeCtx(), { ...text, maxWidth: 20, overflow: "wrap", maxLines: 2 }).h).toBe(2 * 40 * 1.25 + 16);
  });

  it("텍스트 박스는 정렬 기준점에서 시작해요 (left면 x에서 오른쪽으로)", () => {
    const left = layerBounds(fakeCtx(), { ...text, align: "left" });
    expect(left.x).toBe(600 - 8);
    const right = layerBounds(fakeCtx(), { ...text, align: "right" });
    expect(right.x + right.w).toBe(600 + 8);
  });
});

describe("drawGreetingSelection", () => {
  const image: GreetingImage = { background: { presetId: "rose", dataUri: null }, layers: [text, avatar] };
  function recordingCtx() {
    const calls: string[] = [];
    const base = fakeCtx();
    return {
      calls,
      ctx: new Proxy(base, {
        get(target, key) {
          if (key in target) return (target as unknown as Record<string | symbol, unknown>)[key];
          return (...args: unknown[]) => { calls.push(`${String(key)}(${args.join(",")})`); };
        },
        set(target, key, value) { (target as unknown as Record<string | symbol, unknown>)[key] = value; return true; },
      }),
    };
  }

  it("단일 선택은 핸들 4개를 그리고 다중 선택은 핸들 없이 묶음 박스를 그려요", () => {
    const single = recordingCtx();
    drawGreetingSelection(single.ctx, image, ["t"]);
    expect(single.calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(4);
    const multi = recordingCtx();
    drawGreetingSelection(multi.ctx, image, ["t", "a"]);
    expect(multi.calls.filter((call) => call.startsWith("fillRect"))).toHaveLength(0);
    expect(multi.calls.filter((call) => call.startsWith("strokeRect"))).toHaveLength(3);
  });

  it("가이드선과 마퀴를 그려요", () => {
    const rec = recordingCtx();
    drawGreetingSelection(rec.ctx, image, [], { guides: [{ axis: "x", pos: 600, from: 0, to: 675 }], marquee: { x: 1, y: 2, w: 3, h: 4 } });
    expect(rec.calls).toContain("moveTo(600,0)");
    expect(rec.calls).toContain("lineTo(600,675)");
    expect(rec.calls).toContain("strokeRect(1,2,3,4)");
  });
});

describe("LayerPanel — 다중 선택", () => {
  it("Shift 클릭은 additive로, 일반 클릭은 단일로 알려요", async () => {
    const onSelect = vi.fn();
    const noop = vi.fn();
    const { host } = await mount(
      <LayerPanel layers={[text, avatar]} selectedIds={["t"]} saving={false} onSelect={onSelect} onToggleHidden={noop} onRemove={noop} onDuplicate={noop} onMove={noop} />,
    );
    const rows = [...host.querySelectorAll<HTMLButtonElement>("li > button[aria-pressed]")];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    await act(async () => { rows[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true })); });
    expect(onSelect).toHaveBeenLastCalledWith("a", true);
    await act(async () => { rows[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onSelect).toHaveBeenLastCalledWith("a", false);
  });
});

describe("LayerProperties — 텍스트 효과·아바타 옵션", () => {
  function setup(layer: GreetingLayer) {
    const onPatchLayer = vi.fn();
    const onCommit = vi.fn();
    return { onPatchLayer, onCommit, render: () => mount(<LayerProperties layer={layer} saving={false} onPatchLayer={onPatchLayer} onCommit={onCommit} />) };
  }
  const click = async (element: Element | null | undefined) => { await act(async () => { (element as HTMLElement).click(); }); };

  it("여러 개를 선택하면 속성 대신 안내를 보여줘요", async () => {
    const { host } = await mount(<LayerProperties layer={null} selectedCount={3} saving={false} onPatchLayer={vi.fn()} onCommit={vi.fn()} />);
    expect(host.textContent).toContain("3개를 선택");
  });

  it("굵기 단계를 고르면 weight와 bold가 함께 바뀌고 커밋돼요", async () => {
    const { onPatchLayer, onCommit, render } = setup(text);
    const { host } = await render();
    const group = host.querySelector('[aria-label="글자 굵기"]')!;
    expect([...group.querySelectorAll("button")].map((button) => button.textContent)).toEqual(["보통", "중간", "굵게", "아주 굵게"]);
    await click(group.querySelectorAll("button")[2]);
    expect(onPatchLayer).toHaveBeenLastCalledWith("t", { weight: 700, bold: true });
    await click(group.querySelectorAll("button")[0]);
    expect(onPatchLayer).toHaveBeenLastCalledWith("t", { weight: 400, bold: false });
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it("그림자 방식: 기본은 undefined, 없음은 null, 직접 설정은 기본 값이 들어가요", async () => {
    const { onPatchLayer, render } = setup({ ...text, shadow: null });
    const { host } = await render();
    const buttons = host.querySelector('[aria-label="그림자 방식"]')!.querySelectorAll("button");
    await click(buttons[0]);
    expect(onPatchLayer).toHaveBeenLastCalledWith("t", { shadow: undefined });
    await click(buttons[2]);
    expect(onPatchLayer.mock.lastCall![1].shadow).toMatchObject({ color: "#000000", blur: 8 });
  });

  it("외곽선·그라디언트·최대 폭 토글이 각 필드를 켜고 꺼요", async () => {
    const { onPatchLayer, render } = setup(text);
    const { host } = await render();
    const toggle = (label: string) => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes(label));
    await click(toggle("외곽선"));
    expect(onPatchLayer).toHaveBeenLastCalledWith("t", { stroke: { color: "#000000", width: 3 } });
    await click(toggle("그라디언트 글자"));
    expect(onPatchLayer).toHaveBeenLastCalledWith("t", { gradient: { to: "#ffd166", angle: 0 } });
    await click(toggle("최대 폭 제한"));
    expect(onPatchLayer).toHaveBeenLastCalledWith("t", { maxWidth: 500, overflow: "wrap" });
  });

  it("최대 폭이 켜져 있으면 폭·줄 수 슬라이더가 보이고, 말줄임이면 줄 수는 숨어요", async () => {
    const wrapLayer = setup({ ...text, maxWidth: 400 });
    const wrapped = await wrapLayer.render();
    expect(wrapped.host.querySelector('[aria-label="최대 폭"]')).not.toBeNull();
    expect(wrapped.host.querySelector('[aria-label="최대 줄 수"]')).not.toBeNull();
    document.body.innerHTML = "";
    const ellipsis = await setup({ ...text, maxWidth: 400, overflow: "ellipsis" }).render();
    expect(ellipsis.host.querySelector('[aria-label="최대 폭"]')).not.toBeNull();
    expect(ellipsis.host.querySelector('[aria-label="최대 줄 수"]')).toBeNull();
  });

  it("아바타: 모양·그림자·글로우 토글", async () => {
    const { onPatchLayer, render } = setup(avatar);
    const { host } = await render();
    const shapeButtons = host.querySelector('[aria-label="아바타 모양"]')!.querySelectorAll("button");
    expect([...shapeButtons].map((button) => button.textContent)).toEqual(["원", "둥근 사각형", "사각형"]);
    await click(shapeButtons[1]);
    expect(onPatchLayer).toHaveBeenLastCalledWith("a", { shape: "rounded" });
    const toggle = (label: string) => [...host.querySelectorAll("button")].find((button) => button.textContent === label);
    await click(toggle("글로우"));
    expect(onPatchLayer.mock.lastCall![1].glow).toMatchObject({ color: "#ffffff", spread: 4 });
    await click(toggle("그림자"));
    expect(onPatchLayer.mock.lastCall![1].shadow).toMatchObject({ offsetY: 3 });
  });
});

describe("useGreetingShortcuts", () => {
  function actions(): GreetingShortcutActions {
    return {
      undo: vi.fn(), redo: vi.fn(), removeSelected: vi.fn(), copySelected: vi.fn(), cutSelected: vi.fn(), paste: vi.fn(),
      duplicateSelected: vi.fn(), selectAll: vi.fn(), clearSelection: vi.fn(), nudgeSelected: vi.fn(),
    };
  }
  function Harness({ value, hasSelection = true }: { value: GreetingShortcutActions; hasSelection?: boolean }) {
    useGreetingShortcuts({ active: true, saving: false, hasSelection, actions: value });
    return null;
  }
  const press = async (key: string, init: KeyboardEventInit = {}, target: EventTarget = window) => {
    await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init })); });
  };

  it("복사·붙여넣기·복제·잘라내기·전체 선택", async () => {
    const value = actions();
    await mount(<Harness value={value} />);
    await press("c", { ctrlKey: true });
    await press("v", { ctrlKey: true });
    await press("d", { ctrlKey: true });
    await press("x", { metaKey: true });
    await press("a", { ctrlKey: true });
    expect(value.copySelected).toHaveBeenCalledTimes(1);
    expect(value.paste).toHaveBeenCalledTimes(1);
    expect(value.duplicateSelected).toHaveBeenCalledTimes(1);
    expect(value.cutSelected).toHaveBeenCalledTimes(1);
    expect(value.selectAll).toHaveBeenCalledTimes(1);
  });

  it("되돌리기·다시실행과 삭제·방향키 이동(Shift 10배)·Esc", async () => {
    const value = actions();
    await mount(<Harness value={value} />);
    await press("z", { ctrlKey: true });
    await press("z", { ctrlKey: true, shiftKey: true });
    await press("Delete");
    await press("ArrowRight");
    await press("ArrowUp", { shiftKey: true });
    await press("Escape");
    expect(value.undo).toHaveBeenCalledTimes(1);
    expect(value.redo).toHaveBeenCalledTimes(1);
    expect(value.removeSelected).toHaveBeenCalledTimes(1);
    const [right] = (value.nudgeSelected as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(right).toBeCloseTo(100 / 1200);
    const [, up] = (value.nudgeSelected as ReturnType<typeof vi.fn>).mock.calls[1]!;
    expect(up).toBeCloseTo(-1000 / 1200);
    expect(value.clearSelection).toHaveBeenCalledTimes(1);
  });

  it("선택이 없으면 복사·삭제·방향키는 무시하고 붙여넣기는 동작해요", async () => {
    const value = actions();
    await mount(<Harness value={value} hasSelection={false} />);
    await press("c", { ctrlKey: true });
    await press("Delete");
    await press("ArrowLeft");
    await press("v", { ctrlKey: true });
    expect(value.copySelected).not.toHaveBeenCalled();
    expect(value.removeSelected).not.toHaveBeenCalled();
    expect(value.nudgeSelected).not.toHaveBeenCalled();
    expect(value.paste).toHaveBeenCalledTimes(1);
  });

  it("입력 필드에 타이핑 중이거나 라디오 그룹에서 방향키를 쓰면 가로채지 않아요", async () => {
    const value = actions();
    const { host } = await mount(
      <>
        <Harness value={value} />
        <input data-testid="field" />
        <div role="radiogroup"><button type="button" role="radio" aria-checked="false">x</button></div>
      </>,
    );
    await press("v", { ctrlKey: true }, host.querySelector("input")!);
    await press("ArrowLeft", {}, host.querySelector("button")!);
    expect(value.paste).not.toHaveBeenCalled();
    expect(value.nudgeSelected).not.toHaveBeenCalled();
  });
});

describe("useGreetingHistory — 새 필드·다중 조작도 한 단계씩 되돌려요", () => {
  it("텍스트 효과 패치, 붙여넣기(여러 레이어 추가)가 각각 한 단계이고 undo/redo가 새 필드를 복원해요", async () => {
    let current: GreetingImage = { background: { presetId: "rose", dataUri: null }, layers: [text] };
    let api!: ReturnType<typeof useGreetingHistory>;
    function Harness() {
      api = useGreetingHistory({ getSnapshot: () => current, applySnapshot: (next) => { current = next; } });
      return null;
    }
    await mount(<Harness />);

    current = { ...current, layers: [{ ...text, weight: 700, shadow: null, stroke: { color: "#000000", width: 4 } }] };
    await act(async () => { api.commit(); });
    current = { ...current, layers: [...current.layers, { ...avatar, shape: "rounded", glow: { color: "#ffffff", opacity: 1, blur: 10, spread: 2 } }, { ...avatar, id: "a2" }] };
    await act(async () => { api.commit(); });
    expect(current.layers).toHaveLength(3);

    await act(async () => { api.undo(); });
    expect(current.layers).toHaveLength(1);
    expect(current.layers[0]).toMatchObject({ weight: 700, stroke: { width: 4 } });
    await act(async () => { api.undo(); });
    expect(current.layers[0]).toEqual(text);
    await act(async () => { api.redo(); api.redo(); });
    expect(current.layers).toHaveLength(3);
    expect(current.layers[1]).toMatchObject({ shape: "rounded", glow: { spread: 2 } });
  });
});
