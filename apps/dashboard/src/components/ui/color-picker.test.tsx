// @vitest-environment happy-dom
// color-picker 회귀 계약: 키보드 한 스텝이 값 확정(onCommit)까지 이어지는가, HEX 입력이 정규화되지 않은 값을 밖으로 내보내지 않는가.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { ColorPicker } from "./color-picker";

async function mount(node: React.ReactNode) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(node);
	});
	return { container, root };
}

async function unmount(root: ReturnType<typeof createRoot>, container: HTMLElement) {
	await act(async () => {
		root.unmount();
	});
	container.remove();
}

describe("color-picker keyboard and commit contract", () => {
	it("moves the SV surface one keyboard step and commits the same hex", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const onChange = vi.fn();
		const onCommit = vi.fn();
		let container: HTMLElement | null = null;
		let root: ReturnType<typeof createRoot> | null = null;
		try {
			({ container, root } = await mount(
				<ColorPicker value="#ff8888" label="강조색" onChange={onChange} onCommit={onCommit} />,
			));
			const sv = container.querySelector<HTMLElement>('[aria-label="강조색 채도와 명도"]')!;
			expect(sv.getAttribute("role")).toBe("slider");
			await act(async () => {
				sv.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
			});
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(onCommit).toHaveBeenCalledTimes(1);
			const emitted = onCommit.mock.calls[0][0] as string;
			expect(emitted).toMatch(/^#[0-9a-f]{6}$/);
			expect(emitted).not.toBe("#ff8888");
			// 한 스텝도 값 확정 단위라 onChange와 같은 hex로 커밋돼야 히스토리가 갈라지지 않아요.
			expect(emitted).toBe(onChange.mock.calls[0][0]);
		} finally {
			if (root && container) await unmount(root, container);
			vi.unstubAllGlobals();
		}
	});

	it("normalizes valid hex input and ignores broken input", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		const onChange = vi.fn();
		const onCommit = vi.fn();
		let container: HTMLElement | null = null;
		let root: ReturnType<typeof createRoot> | null = null;
		try {
			({ container, root } = await mount(
				<ColorPicker value="#ff0000" label="강조색" onChange={onChange} onCommit={onCommit} />,
			));
			const input = container.querySelector<HTMLInputElement>("input")!;
			expect(input.getAttribute("aria-label")).toBe("강조색 색 HEX");

			await act(async () => {
				setNativeValue(input, "#AABBCC");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			});
			expect(onChange).toHaveBeenCalledWith("#aabbcc");

			await act(async () => {
				setNativeValue(input, "#zz");
				input.dispatchEvent(new Event("input", { bubbles: true }));
			});
			// 깨진 입력은 미리보기를 깨지 않게 값으로 내보내지 않고 무효 표시만 남겨요.
			expect(onChange).toHaveBeenCalledTimes(1);
			expect(input.getAttribute("aria-invalid")).toBe("true");
		} finally {
			if (root && container) await unmount(root, container);
			vi.unstubAllGlobals();
		}
	});
});

/** React가 인스턴스에 붙여둔 value 세터를 우회하고 네이티브 세터로 값을 넣어요 (change 이벤트가 뜨도록). */
function setNativeValue(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
}
