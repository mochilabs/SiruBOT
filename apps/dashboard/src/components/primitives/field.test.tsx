// @vitest-environment happy-dom
// Field 회귀 계약: 설명/오류 id 연결(describedBy), 오류 시 invalid, 필수 표시의 스크린 리더 대안과 required 전달.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

import { Field } from "./field";

async function mount(node: React.ReactNode) {
	const container = document.createElement("div");
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(node);
	});
	return { container, root };
}

describe("field aria wiring", () => {
	it("wires describedBy, invalid and required into the render prop and label", async () => {
		vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
		let container: HTMLElement | null = null;
		let root: ReturnType<typeof createRoot> | null = null;
		try {
			({ container, root } = await mount(
				<Field label="기본 채널" description="미설정이면 그대로 사용해요." error="채널을 골라 주세요." required>
					{({ id, describedBy, invalid, required }) => (
						<input
							id={id}
							aria-describedby={describedBy}
							aria-invalid={invalid || undefined}
							required={required}
							data-slot="control"
						/>
					)}
				</Field>,
			));

			const control = container.querySelector<HTMLInputElement>('[data-slot="control"]')!;
			const label = container.querySelector<HTMLLabelElement>("label")!;
			const description = container.querySelector<HTMLParagraphElement>("p[id$='-description']")!;
			const error = container.querySelector<HTMLParagraphElement>("p[role='alert']")!;

			expect(control.getAttribute("aria-describedby")).toBe(
				[description.id, error.id].filter(Boolean).join(" "),
			);
			expect(control.getAttribute("aria-invalid")).toBe("true");
			expect(control.hasAttribute("required")).toBe(true);
			expect(label.getAttribute("for")).toBe(control.id);
			expect(error.textContent).toBe("채널을 골라 주세요.");

			// 별표는 눈에만 보이고 스크린 리더에는 (필수)가 읽혀야 필수 여부가 전달돼요.
			const marks = Array.from(label.querySelectorAll("span"));
			expect(marks.find((span) => span.getAttribute("aria-hidden") === "true")?.textContent).toBe("*");
			expect(marks.find((span) => span.className.includes("sr-only"))?.textContent).toBe("(필수)");
		} finally {
			const mountedRoot = root;
			const mountedHost = container;
			if (mountedRoot && mountedHost) {
				await act(async () => {
					mountedRoot.unmount();
				});
				mountedHost.remove();
			}
			vi.unstubAllGlobals();
		}
	});
});
