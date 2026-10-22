// api-guards 회귀 계약 — 401/403/502 3상태 분기와 denied* 한국어 응답 매핑을 잠가요.
// auth·session-token·guild-permissions·admin-ids는 전부 모킹해서 게이트 자체 분기만 검증해요.
// (api-handler.test.ts는 게이트를 mock으로 우회해 라우팅만 검증하므로 이 파일이 실제 분기의 커버예요.)
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/session-token", () => ({ getSessionAccessToken: vi.fn() }));
vi.mock("@/lib/guild-permissions", () => ({
	resolveCanManage: vi.fn(),
	resolveGuildMembership: vi.fn(),
}));
vi.mock("@/lib/admin-ids", () => ({ isDashboardAdmin: vi.fn() }));

import { isDashboardAdmin } from "@/lib/admin-ids";
import { auth } from "@/lib/auth";
import { resolveCanManage, resolveGuildMembership } from "@/lib/guild-permissions";
import { getSessionAccessToken } from "@/lib/session-token";

import {
	authorizeDashboardAdmin,
	authorizeGuildManage,
	authorizeGuildMember,
	authorizeUser,
	deniedGuildManage,
	deniedGuildMember,
	deniedUser,
} from "./api-guards";

const session = { user: { id: "user-1" } };
const authMock = () => vi.mocked(auth);
const tokenMock = () => vi.mocked(getSessionAccessToken);
const manageMock = () => vi.mocked(resolveCanManage);
const memberMock = () => vi.mocked(resolveGuildMembership);
const adminMock = () => vi.mocked(isDashboardAdmin);

beforeEach(() => {
	vi.clearAllMocks();
	authMock().mockResolvedValue(session as never);
	tokenMock().mockResolvedValue("token-1");
	manageMock().mockResolvedValue({ status: "ok", manageable: true });
	memberMock().mockResolvedValue({ status: "ok", isMember: true });
	adminMock().mockReturnValue(true);
});

describe("authorizeGuildManage — 3상태 분기", () => {
	it("세션이 없으면 401이에요 (Discord 확인 전에 차단)", async () => {
		authMock().mockResolvedValue(null as never);
		await expect(authorizeGuildManage("guild-1")).resolves.toEqual({ ok: false, status: 401 });
		expect(manageMock()).not.toHaveBeenCalled();
	});

	it("accessToken을 읽을 수 없으면 401이에요", async () => {
		tokenMock().mockResolvedValue(null);
		await expect(authorizeGuildManage("guild-1")).resolves.toEqual({ ok: false, status: 401 });
		expect(manageMock()).not.toHaveBeenCalled();
	});

	it("Discord가 토큰을 무효로 보면 401(재로그인)이에요", async () => {
		manageMock().mockResolvedValue({ status: "invalid-token" });
		await expect(authorizeGuildManage("guild-1")).resolves.toEqual({ ok: false, status: 401 });
	});

	it("Discord 확인 불가(429/5xx/네트워크)면 502를 403으로 위장하지 않아요", async () => {
		manageMock().mockResolvedValue({ status: "unavailable" });
		await expect(authorizeGuildManage("guild-1")).resolves.toEqual({ ok: false, status: 502 });
	});

	it("관리 권한이 없으면 403이에요", async () => {
		manageMock().mockResolvedValue({ status: "ok", manageable: false });
		await expect(authorizeGuildManage("guild-1")).resolves.toEqual({ ok: false, status: 403 });
	});

	it("통과 시 token·userId를 rate limit 키용으로 돌려줘요", async () => {
		await expect(authorizeGuildManage("guild-1")).resolves.toEqual({
			ok: true,
			token: "token-1",
			userId: "user-1",
		});
		expect(manageMock()).toHaveBeenCalledWith("token-1", "user-1", "guild-1");
	});
});

describe("authorizeGuildMember — 3상태 분기", () => {
	it("세션 없음·토큰 없음은 401이에요", async () => {
		authMock().mockResolvedValue(null as never);
		await expect(authorizeGuildMember("guild-1")).resolves.toEqual({ ok: false, status: 401 });

		authMock().mockResolvedValue(session as never);
		tokenMock().mockResolvedValue(null);
		await expect(authorizeGuildMember("guild-1")).resolves.toEqual({ ok: false, status: 401 });
	});

	it("invalid-token은 401, unavailable은 502예요", async () => {
		memberMock().mockResolvedValue({ status: "invalid-token" });
		await expect(authorizeGuildMember("guild-1")).resolves.toEqual({ ok: false, status: 401 });

		memberMock().mockResolvedValue({ status: "unavailable" });
		await expect(authorizeGuildMember("guild-1")).resolves.toEqual({ ok: false, status: 502 });
	});

	it("멤버가 아니면 403이에요", async () => {
		memberMock().mockResolvedValue({ status: "ok", isMember: false });
		await expect(authorizeGuildMember("guild-1")).resolves.toEqual({ ok: false, status: 403 });
	});

	it("멤버면 manage 판정과 무관하게 통과해요", async () => {
		await expect(authorizeGuildMember("guild-1")).resolves.toEqual({
			ok: true,
			token: "token-1",
			userId: "user-1",
		});
		expect(memberMock()).toHaveBeenCalledWith("token-1", "user-1", "guild-1");
	});
});

describe("authorizeUser / authorizeDashboardAdmin", () => {
	it("authorizeUser는 세션만 봐요 — 세션 없음 401", async () => {
		authMock().mockResolvedValue(null as never);
		await expect(authorizeUser()).resolves.toEqual({ ok: false, status: 401 });

		authMock().mockResolvedValue(session as never);
		await expect(authorizeUser()).resolves.toEqual({ ok: true, userId: "user-1" });
	});

	it("authorizeDashboardAdmin은 세션 없음 401, allowlist 미포함 403, 포함이면 통과", async () => {
		authMock().mockResolvedValue(null as never);
		await expect(authorizeDashboardAdmin()).resolves.toEqual({ ok: false, status: 401 });

		authMock().mockResolvedValue(session as never);
		adminMock().mockReturnValue(false);
		await expect(authorizeDashboardAdmin()).resolves.toEqual({ ok: false, status: 403 });

		adminMock().mockReturnValue(true);
		await expect(authorizeDashboardAdmin()).resolves.toEqual({ ok: true, userId: "user-1" });
	});
});

describe("denied* 한국어 응답 매핑", () => {
	const guildCases = [
		{ status: 401, message: "로그인이 필요해요." },
		{ status: 403, message: "이 서버를 관리할 권한이 없어요." },
		{ status: 502, message: "Discord 상태가 좋지 않아 권한을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." },
	] as const;

	it.each(guildCases)("deniedGuildManage는 $status에 맞는 메시지를 실어요", async ({ status, message }) => {
		const res = deniedGuildManage({ ok: false, status });
		expect(res.status).toBe(status);
		await expect(res.json()).resolves.toEqual({ error: message });
	});

	const memberCases = [
		{ status: 401, message: "로그인이 필요해요." },
		{ status: 403, message: "이 서버의 멤버만 사용할 수 있어요." },
		{ status: 502, message: "Discord 상태가 좋지 않아 멤버십을 확인하지 못했어요. 잠시 후 다시 시도해 주세요." },
	] as const;

	it.each(memberCases)("deniedGuildMember는 $status에 맞는 메시지를 실어요", async ({ status, message }) => {
		const res = deniedGuildMember({ ok: false, status });
		expect(res.status).toBe(status);
		await expect(res.json()).resolves.toEqual({ error: message });
	});

	const userCases = [
		{ status: 401, message: "로그인이 필요해요." },
		{ status: 403, message: "권한이 없어요." },
	] as const;

	it.each(userCases)("deniedUser는 $status에 맞는 메시지를 실어요", async ({ status, message }) => {
		const res = deniedUser({ ok: false, status });
		expect(res.status).toBe(status);
		await expect(res.json()).resolves.toEqual({ error: message });
	});
});
