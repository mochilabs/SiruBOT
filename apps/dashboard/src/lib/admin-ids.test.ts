// admin-ids 회귀 계약 — DASHBOARD_ADMIN_IDS 미설정=전원 차단(fail-closed)과 쉼표 파싱을 잠가요.
// env는 테스트마다 설정·삭제하고, 경고는 한 번만 나가는 플래그도 확인해요.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isDashboardAdmin } from "./admin-ids";

const ENV_KEY = "DASHBOARD_ADMIN_IDS";
let warnSpy: { mock: { calls: unknown[][] }; mockRestore: () => void };

beforeEach(() => {
	delete process.env[ENV_KEY];
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
	warnSpy.mockRestore();
	delete process.env[ENV_KEY];
});

describe("isDashboardAdmin — fail-closed allowlist", () => {
	it("env 미설정이면 누구든 차단돼요 (null/undefined/빈 문자열 유저도)", () => {
		expect(isDashboardAdmin("123456789012345678")).toBe(false);
		expect(isDashboardAdmin(null)).toBe(false);
		expect(isDashboardAdmin(undefined)).toBe(false);
	});

	it("env가 공백·쉼표뿐이면 전원 차단이에요", () => {
		process.env[ENV_KEY] = "   ";
		expect(isDashboardAdmin("123456789012345678")).toBe(false);

		process.env[ENV_KEY] = " , , ";
		expect(isDashboardAdmin("123456789012345678")).toBe(false);
	});

	it("쉼표로 구분된 목록은 공백을 잘라 포함된 id만 통과해요", () => {
		process.env[ENV_KEY] = "111111111111111111, 222222222222222222";
		expect(isDashboardAdmin("111111111111111111")).toBe(true);
		expect(isDashboardAdmin("222222222222222222")).toBe(true);
		expect(isDashboardAdmin("333333333333333333")).toBe(false);
	});

	it("env를 나중에 바꾸면 즉시 반영돼요 (호출 시점마다 다시 읽어요)", () => {
		expect(isDashboardAdmin("111111111111111111")).toBe(false);
		process.env[ENV_KEY] = "111111111111111111";
		expect(isDashboardAdmin("111111111111111111")).toBe(true);
		delete process.env[ENV_KEY];
		expect(isDashboardAdmin("111111111111111111")).toBe(false);
	});

	it("미설정 경고는 프로세스당 한 번만 출력해요", async () => {
		// 모듈 리셋으로 프로세스 기동 시점(최초 임포트)을 재현해요 — warnedUnset 플래그 검증용
		vi.resetModules();
		const fresh = await import("./admin-ids");
		fresh.isDashboardAdmin("111111111111111111");
		fresh.isDashboardAdmin("222222222222222222");
		const adminWarns = warnSpy.mock.calls.filter((call: unknown[]) => String(call[0]).includes("[admin-ids]"));
		expect(adminWarns).toHaveLength(1);
	});
});
