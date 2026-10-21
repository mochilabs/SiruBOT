// @vitest-environment happy-dom
import { act, type ReactNode,useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { SWRResponse } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api-error";

import { createApiFetcher, fetchWithSessionRetry, useAuthedSWR, useGuildResource } from "./swr";

const remote = vi.hoisted(() => ({
	sessionStatus: "authenticated" as "loading" | "authenticated" | "unauthenticated",
	swrCalls: [] as Array<{ key: string | null; fetcher: unknown; config: unknown }>,
	swrError: undefined as unknown,
	redirectCalls: [] as Array<{ expired: boolean; callbackUrl: string }>,
	redirectFn: vi.fn(),
}));

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: remote.sessionStatus }) }));

vi.mock("swr", () => ({
	default: (key: string | null, fetcher?: unknown, config?: unknown) => {
		remote.swrCalls.push({ key, fetcher, config });
		return { data: undefined, error: remote.swrError, isLoading: false, isValidating: false, mutate: vi.fn() };
	},
}));

vi.mock("@/hooks/use-session-redirect", () => ({
	useSessionExpiredRedirect: (expired: boolean, callbackUrl: string) => {
		remote.redirectCalls.push({ expired, callbackUrl });
		return remote.redirectFn;
	},
}));

let root: Root;
let element: HTMLDivElement;

function lastSwrCall() {
	return remote.swrCalls.at(-1);
}

function lastRedirectCall() {
	return remote.redirectCalls.at(-1);
}

async function render(node: ReactNode) {
	await act(async () => {
		root.render(node);
	});
}

beforeEach(() => {
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	remote.sessionStatus = "authenticated";
	remote.swrCalls.length = 0;
	remote.redirectCalls.length = 0;
	remote.swrError = undefined;
	remote.redirectFn.mockClear();
	element = document.createElement("div");
	document.body.append(element);
	root = createRoot(element);
});

afterEach(async () => {
	await act(async () => {
		root.unmount();
	});
	element.remove();
	vi.unstubAllGlobals();
});

function AuthedProbe({ fetchKey, callbackUrl }: { fetchKey: string | null; callbackUrl: string }) {
	useAuthedSWR<{ ok: boolean }>(fetchKey, callbackUrl);
	return null;
}

describe("useAuthedSWR", () => {
	it("opens the key only when the session is authenticated", async () => {
		remote.sessionStatus = "loading";
		await render(<AuthedProbe fetchKey="/api/playlists" callbackUrl="/playlists" />);
		expect(lastSwrCall()?.key).toBeNull();

		remote.sessionStatus = "authenticated";
		await render(<AuthedProbe fetchKey="/api/playlists" callbackUrl="/playlists" />);
		expect(lastSwrCall()?.key).toBe("/api/playlists");
		// 전역 SWRConfig fetcher를 쓰도록 fetcher 인자를 넘기지 않아요
		expect(lastSwrCall()?.fetcher).toBeUndefined();
	});

	it("keeps the key closed and asks for a login redirect when unauthenticated", async () => {
		remote.sessionStatus = "unauthenticated";
		await render(<AuthedProbe fetchKey="/api/playlists" callbackUrl="/playlists" />);
		expect(lastSwrCall()?.key).toBeNull();
		expect(lastRedirectCall()).toEqual({ expired: true, callbackUrl: "/playlists" });
	});
});

type GuildResult = SWRResponse<{ url: string }> & { guildUrl: string; redirectToLogin: () => void };

let lastGuildResult: GuildResult | undefined;

function GuildProbe({ enabled = true }: { enabled?: boolean }) {
	const fetcher = async (url: string) => ({ url });
	const result = useGuildResource<{ url: string }>("g1", "/settings", { fetcher, enabled });
	useEffect(() => {
		lastGuildResult = result;
	});
	return null;
}

describe("useGuildResource", () => {
	it("builds the guild-scoped key and exposes guildUrl/redirectToLogin", async () => {
		await render(<GuildProbe />);
		expect(lastSwrCall()?.key).toBe("/api/servers/g1/settings");
		expect(typeof lastSwrCall()?.fetcher).toBe("function");
		expect(lastGuildResult?.guildUrl).toBe("/api/servers/g1/settings");
		expect(lastGuildResult?.redirectToLogin).toBe(remote.redirectFn);
	});

	it("closes the key when disabled", async () => {
		await render(<GuildProbe enabled={false} />);
		expect(lastSwrCall()?.key).toBeNull();
	});

	it("asks for a login redirect only on a 401 ApiError", async () => {
		remote.swrError = new ApiError("세션이 만료됐어요.", false, 401);
		await render(<GuildProbe />);
		expect(lastRedirectCall()).toEqual({ expired: true, callbackUrl: "/servers/g1" });

		remote.swrError = new ApiError("일시적 오류예요.", true, 500);
		await render(<GuildProbe />);
		expect(lastRedirectCall()).toEqual({ expired: false, callbackUrl: "/servers/g1" });

		remote.swrError = new Error("plain");
		await render(<GuildProbe />);
		expect(lastRedirectCall()).toEqual({ expired: false, callbackUrl: "/servers/g1" });
	});
});

describe("createApiFetcher", () => {
	it("returns the parsed body on success and sends cache: no-store", async () => {
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock.mockResolvedValueOnce(Response.json({ volume: 80 }));
		vi.stubGlobal("fetch", fetchMock);

		const fetcher = createApiFetcher<{ volume: number }>("실패");
		await expect(fetcher("/api/x")).resolves.toEqual({ volume: 80 });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock.mock.calls[0][0]).toBe("/api/x");
		expect(fetchMock.mock.calls[0][1]).toEqual({ cache: "no-store" });
	});

	it("prefers the server's Korean error message and keeps the status", async () => {
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock.mockResolvedValueOnce(Response.json({ error: "너무 자주 요청했어요." }, { status: 429 }));
		vi.stubGlobal("fetch", fetchMock);

		const fetcher = createApiFetcher("기본 메시지");
		const failure = await fetcher("/api/x").catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(ApiError);
		expect((failure as ApiError).message).toBe("너무 자주 요청했어요.");
		expect((failure as ApiError).status).toBe(429);
	});

	it("falls back for non-JSON bodies and marks 401/403 as not retryable", async () => {
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock.mockResolvedValueOnce(new Response("bad gateway", { status: 403 }));
		vi.stubGlobal("fetch", fetchMock);

		const fetcher = createApiFetcher("목록을 불러오지 못했어요.");
		const failure = (await fetcher("/api/x").catch((error: unknown) => error)) as ApiError;
		expect(failure.message).toBe("목록을 불러오지 못했어요.");
		expect(failure.retryable).toBe(false);
	});

	it("with sessionRetry, refreshes the session once on 401 and retries the request", async () => {
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock
			.mockResolvedValueOnce(Response.json({ error: "세션 만료" }, { status: 401 }))
			.mockResolvedValueOnce(Response.json({ user: { id: "user-1" } }))
			.mockResolvedValueOnce(Response.json({ volume: 100 }));
		vi.stubGlobal("fetch", fetchMock);

		const fetcher = createApiFetcher<{ volume: number }>("실패", { sessionRetry: true });
		await expect(fetcher("/api/servers/g1/settings")).resolves.toEqual({ volume: 100 });
		expect(fetchMock.mock.calls.map((call) => call[0])).toEqual(["/api/servers/g1/settings", "/api/auth/session", "/api/servers/g1/settings"]);
	});

	it("with sessionRetry, surfaces the original 401 when the session cannot refresh", async () => {
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock
			.mockResolvedValueOnce(Response.json({ error: "세션 만료" }, { status: 401 }))
			.mockResolvedValueOnce(Response.json({}));
		vi.stubGlobal("fetch", fetchMock);

		const fetcher = createApiFetcher("실패", { sessionRetry: true });
		const failure = (await fetcher("/api/x").catch((error: unknown) => error)) as ApiError;
		expect(failure.status).toBe(401);
		// 세션 갱신이 정보를 주지 못하면 재시도하지 않아요
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it("without sessionRetry, a 401 does not hit the session endpoint", async () => {
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock.mockResolvedValueOnce(Response.json({ error: "세션 만료" }, { status: 401 }));
		vi.stubGlobal("fetch", fetchMock);

		const failure = (await createApiFetcher("실패")("/api/x").catch((error: unknown) => error)) as ApiError;
		expect(failure.status).toBe(401);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("fetchWithSessionRetry", () => {
	it("passes non-401 responses through untouched", async () => {
		const ok = Response.json({ ok: true });
		const fetchMock = vi.fn<(input: unknown, init?: RequestInit) => Promise<Response>>();
		fetchMock.mockResolvedValueOnce(ok);
		vi.stubGlobal("fetch", fetchMock);

		await expect(fetchWithSessionRetry("/api/x")).resolves.toBe(ok);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
