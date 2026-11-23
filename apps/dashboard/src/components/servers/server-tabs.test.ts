import { describe, expect, it } from "vitest";

import { DEFAULT_SERVER_TAB, getTabModule, resolveServerTab, SERVER_TABS } from "./server-tabs";

describe("server-tabs", () => {
	it("첫 번째 탭과 기본 탭은 개요(overview)예요", () => {
		expect(DEFAULT_SERVER_TAB).toBe("overview");
		expect(SERVER_TABS[0]?.key).toBe("overview");
		expect(resolveServerTab(null)).toBe("overview");
		expect(resolveServerTab(undefined)).toBe("overview");
		expect(resolveServerTab("")).toBe("overview");
		expect(resolveServerTab("does-not-exist")).toBe("overview");
	});

	it("기존 ?tab= 딥링크와 mixer 별칭이 그대로 동작해요", () => {
		expect(resolveServerTab("mixer")).toBe("music");
		for (const tab of SERVER_TABS) {
			expect(resolveServerTab(tab.key)).toBe(tab.key);
		}
		// 모듈 탭은 개요(모듈 켜기/끄기)와 봇 프로필(테마)로 합쳐졌어요.
		expect(resolveServerTab("modules")).toBe("overview");
	});

	it("모듈에 속한 탭과 항상 켜진 탭을 구분해요", () => {
		expect(getTabModule("overview")).toBeNull();
		expect(getTabModule("channels")).toBeNull();
		expect(getTabModule("music")).toBe("music");
		expect(getTabModule("player-live")).toBe("music");
		expect(getTabModule("ai")).toBe("ai");
		expect(getTabModule("ticket")).toBe("community");
		expect(getTabModule("chat-tools")).toBe("utility");
	});
});
