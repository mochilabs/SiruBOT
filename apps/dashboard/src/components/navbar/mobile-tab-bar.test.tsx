// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileTabBar } from "./mobile-tab-bar";

const mocks = vi.hoisted(() => ({ pathname: "/shards" }));
vi.mock("next/navigation", () => ({
	usePathname: () => mocks.pathname
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function render(status: "authenticated" | "unauthenticated" | "loading") {
	host = document.createElement("div");
	document.body.appendChild(host);
	root = createRoot(host);
	act(() => {
		root!.render(<MobileTabBar status={status} />);
	});
	return host;
}

afterEach(() => {
	act(() => root?.unmount());
	host?.remove();
	root = null;
	host = null;
});

describe("MobileTabBar", () => {
	it("메인 메뉴 5개를 같은 폭의 칸으로 그려요", () => {
		const el = render("authenticated");
		const links = el.querySelectorAll("a");
		expect(links).toHaveLength(5);
		expect([...links].map((a) => a.textContent)).toEqual(["상태", "차트", "프로필", "플레이리스트", "대시보드"]);
	});

	it("현재 경로의 탭에만 aria-current를 달아요", () => {
		mocks.pathname = "/track";
		const el = render("authenticated");
		const current = el.querySelectorAll('a[aria-current="page"]');
		expect(current).toHaveLength(1);
		expect(current[0]?.getAttribute("href")).toBe("/track");
	});

	it("로그인하지 않으면 보호된 탭이 로그인 경로로 가요", () => {
		mocks.pathname = "/shards";
		const el = render("unauthenticated");
		const profile = [...el.querySelectorAll("a")].find((a) => a.textContent === "프로필");
		expect(profile?.getAttribute("href")).toContain("/api/auth/signin");
	});
});
