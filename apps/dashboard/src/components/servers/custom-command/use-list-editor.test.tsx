// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useListEditor } from "./use-list-editor";

function Harness({ items, onChange }: { items: readonly string[]; onChange: (next: string[]) => void }) {
  const { keys, updateItem, moveItem, removeItem } = useListEditor(items, onChange);
  return (
    <div>
      <button onClick={() => moveItem(0, -1)}>첫 행 위로</button>
      <button onClick={() => moveItem(2, 1)}>끝 행 아래로</button>
      <button onClick={() => moveItem(0, 1)}>첫 행 아래로</button>
      <button onClick={() => moveItem(2, -1)}>끝 행 위로</button>
      <button onClick={() => updateItem(1, "B")}>수정</button>
      <button onClick={() => removeItem(0)}>삭제</button>
      <output data-testid="keys">{keys.join(",")}</output>
    </div>
  );
}

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.unstubAllGlobals();
});

async function click(index: number) {
  const button = document.querySelectorAll<HTMLButtonElement>("button")[index];
  await act(async () => { button.click(); });
}

describe("useListEditor", () => {
  it("moveItem은 경계 밖으로 나가지 않고 위치만 바꿔요", async () => {
    const onChange = vi.fn();
    await act(async () => { root.render(<Harness items={["a", "b", "c"]} onChange={onChange} />); });

    await click(0);
    await click(1);
    expect(onChange).not.toHaveBeenCalled();

    await click(2);
    expect(onChange).toHaveBeenLastCalledWith(["b", "a", "c"]);

    await click(3);
    expect(onChange).toHaveBeenLastCalledWith(["a", "c", "b"]);
  });

  it("updateItem·removeItem은 해당 인덱스만 손보고, 리렌더된 목록·콜백을 최신으로 써요", async () => {
    const first = vi.fn();
    await act(async () => { root.render(<Harness items={["a", "b", "c"]} onChange={first} />); });

    await click(4);
    expect(first).toHaveBeenLastCalledWith(["a", "B", "c"]);

    await click(5);
    expect(first).toHaveBeenLastCalledWith(["b", "c"]);

    const second = vi.fn();
    await act(async () => { root.render(<Harness items={["x", "y"]} onChange={second} />); });
    await click(2);
    expect(second).toHaveBeenLastCalledWith(["y", "x"]);
    expect(first).toHaveBeenCalledTimes(2);
  });

  it("중간 삭제·순서 이동 시 keys 배열도 항목을 따라 이동해 정체성을 유지해요", async () => {
    let current = ["a", "b", "c"];
    const rerender = async () => {
      await act(async () => { root.render(<Harness items={current} onChange={(next) => { current = next; }} />); });
    };
    await rerender();
    const initialKeys = document.querySelector("[data-testid='keys']")?.textContent?.split(",") ?? [];
    expect(initialKeys).toHaveLength(3);
    expect(new Set(initialKeys).size).toBe(3);

    // 0번을 아래로 이동 → key 순서도 [k1, k0, k2]로 뒤바뀌어야 함
    await click(2);
    await rerender();
    expect(document.querySelector("[data-testid='keys']")?.textContent).toBe(
      [initialKeys[1], initialKeys[0], initialKeys[2]].join(","),
    );

    // 새 0번(원래 1번) 삭제 → 남은 key는 [k0, k2] (뒤 항목이 앞 key를 물려받지 않음)
    await click(5);
    await rerender();
    expect(document.querySelector("[data-testid='keys']")?.textContent).toBe(
      [initialKeys[0], initialKeys[2]].join(","),
    );
  });
});
