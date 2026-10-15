// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { MobileTabBar } from "./mobile-tab-bar";

const mocks = vi.hoisted(() => ({ push: vi.fn(), pathname: "/shards" }));
vi.mock("next/navigation", () => ({
	useRouter: () => ({ push: mocks.push }),
	usePathname: () => mocks.pathname
}));

/* happy-dom에선 framer 애니메이션 루프(rAF)가 돌지 않아 animate만 값 적용 페이크로 바꿔요.
   stop()된 애니메이션이 목표에 도달하지 못하는 것도 그대로 재현해서 끊김을 검증해요. */
const anim = vi.hoisted(() => {
	type Tickable = { get: () => number; set: (value: number) => void };
	const live: Array<{ value: Tickable; target: number; stopped: boolean }> = [];
	return {
		live,
		animate: (value: Tickable, target: number) => {
			const entry = { value, target, stopped: false };
			live.push(entry);
			return {
				stop: () => {
					entry.stopped = true;
				}
			};
		},
		flush: () => {
			for (const entry of live) {
				if (!entry.stopped) entry.value.set(entry.target);
			}
		}
	};
});
vi.mock("framer-motion", async (importOriginal) => ({
	...(await importOriginal<typeof import("framer-motion")>()),
	animate: anim.animate
}));

/* happy-dom엔 레이아웃이 없어 탭 5개(각 80px, 90px 간격)와 컨테이너 rect를 흉내 내요. */
const TAB_LEFT = (index: number) => 20 + index * 90;
const originalRect = Element.prototype.getBoundingClientRect;

function pointerEvent(type: string, clientX: number): PointerEvent {
	return new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX });
}

let host: HTMLDivElement;
let root: Root;

beforeAll(() => {
	Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
		const isTab = this instanceof HTMLAnchorElement;
		const index = isTab ? Array.prototype.indexOf.call(this.parentElement?.children ?? [], this) : 0;
		const left = isTab ? TAB_LEFT(index) : 0;
		const width = isTab ? 80 : 470;
		return { x: left, y: 0, left, top: 0, right: left + width, bottom: 48, width, height: 48, toJSON: () => ({}) } as DOMRect;
	};
});

afterAll(() => {
	Element.prototype.getBoundingClientRect = originalRect;
});

afterEach(async () => {
	await act(async () => root.unmount());
	host.remove();
	vi.unstubAllGlobals();
	mocks.push.mockReset();
	mocks.pathname = "/shards";
});

async function mountBar() {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
	host = document.createElement("div");
	document.body.append(host);
	root = createRoot(host);
	await act(async () => {
		root.render(<MobileTabBar status="authenticated" />);
	});
	const links = [...host.querySelectorAll<HTMLAnchorElement>("a")];
	const pill = host.querySelector<HTMLSpanElement>("span[aria-hidden]")!;
	return { links, pill, bar: pill.parentElement! };
}

describe("모바일 탭바 드래그 필", () => {
	it("첫 측정에서 활성 탭 위에 알약을 정확히 놓아요", async () => {
		const { pill, links } = await mountBar();
		expect(pill.style.width).toBe("80px");
		expect(pill.style.transform).toContain("translateX(20px)");
		expect(links[0].getAttribute("aria-current")).toBe("page");
		expect(links[0].className).toContain("text-primary-text");
	});

	it("드래그하면 손끝 탭이 미리 밝아지고, 놓으면 그 탭으로 이동해요", async () => {
		const { links, bar } = await mountBar();
		await act(async () => bar.dispatchEvent(pointerEvent("pointerdown", 60)));
		await act(async () => window.dispatchEvent(pointerEvent("pointermove", 300)));
		expect(links[3].className).toContain("text-primary-text");
		expect(links[0].className).not.toContain("text-primary-text");
		expect(links[0].getAttribute("aria-current")).toBe("page");
		await act(async () => window.dispatchEvent(pointerEvent("pointerup", 300)));
		expect(mocks.push).toHaveBeenCalledWith("/playlists");

		// 드래그가 남긴 클릭은 삼켜져서 놓은 자리의 링크가 한 번에 눌리지 않아요
		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		links[3].dispatchEvent(click);
		expect(click.defaultPrevented).toBe(true);
	});

	it("같은 탭 안에서 놓으면 이동하지 않고 제자리로 돌아와요", async () => {
		const { bar } = await mountBar();
		await act(async () => bar.dispatchEvent(pointerEvent("pointerdown", 60)));
		await act(async () => window.dispatchEvent(pointerEvent("pointermove", 70)));
		await act(async () => window.dispatchEvent(pointerEvent("pointerup", 70)));
		expect(mocks.push).not.toHaveBeenCalled();
	});

	it("움직임 없이 그냥 누르면 링크 기본 동작을 그대로 둬요", async () => {
		const { bar } = await mountBar();
		await act(async () => bar.dispatchEvent(pointerEvent("pointerdown", 60)));
		await act(async () => window.dispatchEvent(pointerEvent("pointerup", 60)));
		expect(mocks.push).not.toHaveBeenCalled();
		const click = new MouseEvent("click", { bubbles: true, cancelable: true });
		bar.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(false);
	});

	it("탭 이동으로 알약이 옮겨가도 눌림 해제 애니메이션이 끊기지 않아요", async () => {
		const { bar } = await mountBar();
		const before = anim.live.length;
		await act(async () => bar.dispatchEvent(pointerEvent("pointerdown", 60)));
		anim.flush();
		// 눌림: scaleX·scaleY 모션 값이 실제로 작아졌는지 (DOM 갱신은 rAF가 없어 값으로 검증해요)
		const pressEntries = anim.live.slice(before);
		expect(pressEntries.map((entry) => entry.value.get())).toEqual([0.955, 0.9]);
		await act(async () => window.dispatchEvent(pointerEvent("pointerup", 60)));
		const releaseEntries = anim.live.slice(anim.live.length - 2);
		// 놓기 직후 라우트가 바뀌어 탭 전환 애니메이션이 시작돼도 눌림 해제는 완료되어야 해요
		mocks.pathname = "/track";
		await act(async () => {
			root.render(<MobileTabBar status="authenticated" />);
		});
		anim.flush();
		expect(releaseEntries.map((entry) => entry.value.get())).toEqual([1, 1]);
	});
});
