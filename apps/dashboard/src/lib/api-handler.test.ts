// createGuildApiHandler 회귀 계약 — 게이트 순서(인가 → 레이트리밋 → 스키마 → 핸들러)와
// role별 게이트 라우팅, rate: null 명시 면제, rateKey 오버라이드를 잠가요.
// api-guards/rate-limit은 전부 모킹하고 래퍼의 동선만 검증해요.
import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
	authorizeDashboardAdmin,
	authorizeGuildManage,
	authorizeGuildMember,
	authorizeUser,
	deniedGuildManage,
} from "@/lib/api-guards";
import { guardRateLimit } from "@/lib/rate-limit";

import { createGuildApiHandler } from "./api-handler";

vi.mock("@/lib/api-guards", async () => {
	const denied = (prefix: string) => (authz: { status: number }) => NextResponse.json({ error: `${prefix}:${authz.status}` }, { status: authz.status });
	return {
		authorizeGuildManage: vi.fn(),
		authorizeGuildMember: vi.fn(),
		authorizeUser: vi.fn(),
		authorizeDashboardAdmin: vi.fn(),
		deniedGuildManage: vi.fn(denied("manage")),
		deniedGuildMember: vi.fn(denied("member")),
		deniedUser: vi.fn(denied("user")),
	};
});

vi.mock("@/lib/rate-limit", () => ({
	guardRateLimit: vi.fn().mockResolvedValue(null),
	rateKey: (...parts: (string | null | undefined)[]) => parts.map((part) => part ?? "-").join(":"),
}));

const RULE = { limit: 12, windowMs: 60_000 };

function makeRequest(body?: unknown): Request {
	if (body === undefined) return new Request("http://localhost/api/test");
	return new Request("http://localhost/api/test", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

const guildContext = { params: Promise.resolve({ id: "guild-1" }) };

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(authorizeGuildManage).mockResolvedValue({ ok: true, token: "token-1", userId: "user-1" });
	vi.mocked(authorizeGuildMember).mockResolvedValue({ ok: true, token: "token-1", userId: "user-1" });
	vi.mocked(authorizeUser).mockResolvedValue({ ok: true, userId: "user-1" });
	vi.mocked(authorizeDashboardAdmin).mockResolvedValue({ ok: true, userId: "user-1" });
	vi.mocked(guardRateLimit).mockResolvedValue(null);
});

describe("createGuildApiHandler — 게이트 순서", () => {
	it("인가 실패 시 레이트리밋·핸들러를 호출하지 않고 denied 응답을 돌려줘요", async () => {
		vi.mocked(authorizeGuildManage).mockResolvedValue({ ok: false, status: 403 });
		const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "test", handler });
		const res = await route(makeRequest(), guildContext);

		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({ error: "manage:403" });
		expect(deniedGuildManage).toHaveBeenCalledTimes(1);
		expect(guardRateLimit).not.toHaveBeenCalled();
		expect(handler).not.toHaveBeenCalled();
	});

	it("레이트리밋 초과 시 429를 그대로 돌려주고 핸들러를 호출하지 않아요", async () => {
		vi.mocked(guardRateLimit).mockResolvedValue(NextResponse.json({ error: "rate" }, { status: 429 }));
		const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));

		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "test", handler });
		const res = await route(makeRequest(), guildContext);

		expect(res.status).toBe(429);
		expect(handler).not.toHaveBeenCalled();
	});

	it("기본 버킷 키는 key:userId:guildId예요", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "bucket", handler });
		await route(makeRequest(), guildContext);

		expect(guardRateLimit).toHaveBeenCalledWith("bucket:user-1:guild-1", RULE);
	});

	it("user/admin 역할은 버킷 키에 guildId를 넣지 않아요", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
		const route = createGuildApiHandler({ role: "user", rate: RULE, key: "bucket", handler });
		await route(makeRequest(), { params: Promise.resolve({ id: "playlist-1" }) });

		expect(guardRateLimit).toHaveBeenCalledWith("bucket:user-1", RULE);
	});

	it("rateKey 오버라이드가 기본 조립을 대신해요", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
		const route = createGuildApiHandler({
			role: "user",
			rate: RULE,
			key: "bucket",
			rateKey: ({ key, userId, params }) => `${key}:${userId}:${params.id}`,
			handler,
		});
		await route(makeRequest(), { params: Promise.resolve({ id: "playlist-1" }) });

		expect(guardRateLimit).toHaveBeenCalledWith("bucket:user-1:playlist-1", RULE);
	});

	it("rate: null이면 레이트리밋을 건너뛰어요 (SSE·공용 헬퍼 위임)", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
		const route = createGuildApiHandler({ role: "manage", rate: null, handler });
		await route(makeRequest(), guildContext);

		expect(guardRateLimit).not.toHaveBeenCalled();
		expect(handler).toHaveBeenCalledTimes(1);
	});
});

describe("createGuildApiHandler — role별 게이트 라우팅", () => {
	it("member는 authorizeGuildMember + deniedGuildMember를 써요", async () => {
		vi.mocked(authorizeGuildMember).mockResolvedValue({ ok: false, status: 403 });
		const route = createGuildApiHandler({ role: "member", rate: RULE, key: "t", handler: async () => NextResponse.json({}) });
		const res = await route(makeRequest(), guildContext);

		expect(authorizeGuildMember).toHaveBeenCalledWith("guild-1");
		expect(res.status).toBe(403);
		await expect(res.json()).resolves.toEqual({ error: "member:403" });
	});

	it("user는 authorizeUser를 쓰고 길드 인자를 넘기지 않아요", async () => {
		vi.mocked(authorizeUser).mockResolvedValue({ ok: false, status: 401 });
		const route = createGuildApiHandler({ role: "user", rate: RULE, key: "t", handler: async () => NextResponse.json({}) });
		const res = await route(makeRequest(), { params: Promise.resolve({}) });

		expect(authorizeUser).toHaveBeenCalledWith();
		expect(res.status).toBe(401);
	});

	it("admin은 authorizeDashboardAdmin을 써요", async () => {
		vi.mocked(authorizeDashboardAdmin).mockResolvedValue({ ok: false, status: 403 });
		const route = createGuildApiHandler({ role: "admin", rate: RULE, key: "t", handler: async () => NextResponse.json({}) });
		const res = await route(makeRequest(), { params: Promise.resolve({}) });

		expect(authorizeDashboardAdmin).toHaveBeenCalledWith();
		expect(res.status).toBe(403);
	});
});

describe("createGuildApiHandler — 본문 스키마", () => {
	const schema = z.object({ volume: z.number().int().min(0).max(100) });

	it("검증 통과 본문이 data로 핸들러에 전달돼요", async () => {
		const handler = vi.fn().mockImplementation(async ({ data }) => NextResponse.json({ received: data }));
		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "t", schema, handler });
		const res = await route(makeRequest({ volume: 42 }), guildContext);

		await expect(res.json()).resolves.toEqual({ received: { volume: 42 } });
	});

	it("검증 실패면 invalidMessage로 400을 돌려주고 핸들러는 부르지 않아요", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "t", schema, invalidMessage: "고정 메시지예요.", handler });
		const res = await route(makeRequest({ volume: 150 }), guildContext);

		expect(res.status).toBe(400);
		await expect(res.json()).resolves.toEqual({ error: "고정 메시지예요." });
		expect(handler).not.toHaveBeenCalled();
	});

	it("invalidMessage가 없으면 zodError 첫 이슈 메시지를 내려요", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "t", schema, handler });
		const res = await route(makeRequest({ volume: 150 }), guildContext);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("volume:");
	});

	it("미등록 필드가 섞이면 parseSettingBody 공통 계약대로 400으로 거절해요", async () => {
		const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "t", schema, handler });
		const res = await route(makeRequest({ volume: 42, junk: 1 }), guildContext);

		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error).toContain("지원하지 않는 필드예요");
		expect(handler).not.toHaveBeenCalled();
	});

	it("JSON이 깨져 있으면 null로 떨어져 400 스키마 검증으로 이어져요", async () => {
		const request = new Request("http://localhost/api/test", { method: "POST", body: "{not-json" });
		const handler = vi.fn().mockResolvedValue(NextResponse.json({}));
		const route = createGuildApiHandler({ role: "manage", rate: RULE, key: "t", schema, invalidMessage: "고정 메시지예요.", handler });
		const res = await route(request, guildContext);

		expect(res.status).toBe(400);
		expect(handler).not.toHaveBeenCalled();
	});

	it("manage 라우트에서 guildId·authz.token·params가 컨텍스트로 전달돼요", async () => {
		const handler = vi.fn().mockImplementation(async ({ guildId, authz, params }) => NextResponse.json({ guildId, token: authz.token, extra: params.cmdId }));
		const route = createGuildApiHandler({ role: "member", rate: RULE, key: "t", handler });
		const res = await route(makeRequest(), { params: Promise.resolve({ id: "guild-1", cmdId: "cmd-9" }) });

		await expect(res.json()).resolves.toEqual({ guildId: "guild-1", token: "token-1", extra: "cmd-9" });
	});
});
