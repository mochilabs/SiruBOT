// data-api HTTP 프록시 클라이언트 계약 — 키 미설정 시 fail-safe(null/503), 인증 헤더는 키 원문,
// forward*는 실패 상태와 본문 message를 파기하지 않는 것을 잠가요.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ClientModule = typeof import("./client");

const ENV_KEYS = ["DATA_API_AUTH_KEY", "AUTH_KEY", "DATA_API_URL"] as const;
const fetchMock = vi.fn();

/** 모듈이 import 시점에 env를 읽으므로 테스트마다 env를 바꾸고 다시 불러와요. */
async function loadClient(env: Record<string, string>): Promise<ClientModule> {
	vi.resetModules();
	for (const key of ENV_KEYS) delete process.env[key];
	Object.assign(process.env, env);
	return import("./client");
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function okJson(body: unknown): Response {
	return jsonResponse(200, body);
}

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetModules();
	for (const key of ENV_KEYS) delete process.env[key];
});

describe("fetchDataApi", () => {
	it("키가 없으면 fetch를 부르지 않고 null을 돌려줘요", async () => {
		const { fetchDataApi } = await loadClient({ DATA_API_URL: "http://data-api:3002" });
		await expect(fetchDataApi("/v1/status")).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalled();
	});

	it("키를 공백만 trim한 원문을 Authorization 헤더로 붙여 지정 URL로 요청해요", async () => {
		fetchMock.mockResolvedValue(okJson({ ok: true }));
		const { fetchDataApi } = await loadClient({ DATA_API_URL: "http://data-api:3002", DATA_API_AUTH_KEY: "  secret  " });
		await expect(fetchDataApi("/v1/status")).resolves.toEqual({ ok: true });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://data-api:3002/v1/status");
		expect(init.headers).toEqual({ Authorization: "secret" });
		expect(init.cache).toBe("no-store");
	});

	it("HTTP 오류·네트워크 예외는 null로 삼켜요", async () => {
		const { fetchDataApi } = await loadClient({ AUTH_KEY: "secret" });
		fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }));
		await expect(fetchDataApi("/v1/status")).resolves.toBeNull();
		fetchMock.mockRejectedValueOnce(new Error("offline"));
		await expect(fetchDataApi("/v1/status")).resolves.toBeNull();
	});
});

describe("postDataApi", () => {
	it("키가 없으면 요청 없이 null이에요", async () => {
		const { postDataApi } = await loadClient({});
		await expect(postDataApi("/v1/x", { a: 1 })).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("POST JSON으로 본문을 실어 보내요", async () => {
		fetchMock.mockResolvedValue(okJson({ ok: true }));
		const { postDataApi } = await loadClient({ AUTH_KEY: "secret" });
		await postDataApi("/v1/x", { a: 1 });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://localhost:3002/v1/x");
		expect(init.method).toBe("POST");
		expect(init.headers).toEqual({ Authorization: "secret", "Content-Type": "application/json" });
		expect(init.body).toBe(JSON.stringify({ a: 1 }));
	});
});

describe("openDataApiStream", () => {
	it("키가 없거나 upstream가 실패하면 null이에요", async () => {
		const { openDataApiStream } = await loadClient({});
		await expect(openDataApiStream("/v1/player/stream")).resolves.toBeNull();

		const withKey = await loadClient({ AUTH_KEY: "secret" });
		fetchMock.mockResolvedValueOnce(new Response("nope", { status: 503 }));
		await expect(withKey.openDataApiStream("/v1/player/stream")).resolves.toBeNull();
	});

	it("성공한 upstream Response를 그대로 돌려줘요", async () => {
		fetchMock.mockResolvedValue(new Response("data", { status: 200 }));
		const { openDataApiStream } = await loadClient({ AUTH_KEY: "secret" });
		const upstream = await openDataApiStream("/v1/player/stream");
		expect(upstream).not.toBeNull();
		expect(await upstream!.text()).toBe("data");
		// SSE는 장기 연결이라 timeout 시그널을 걸지 않아요
		const init = fetchMock.mock.calls[0][1];
		expect(init.signal).toBeUndefined();
		expect(init.headers).toEqual({ Authorization: "secret" });
	});
});

describe("forwardDataApiPost", () => {
	it("키가 없으면 503으로 응답해요", async () => {
		const { forwardDataApiPost } = await loadClient({});
		await expect(forwardDataApiPost("/v1/x", { a: 1 })).resolves.toEqual({ ok: false, status: 503, message: null });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("성공하면 data를 그대로 싣고, 실패해도 status·한국어 message를 보존해요", async () => {
		fetchMock.mockResolvedValueOnce(okJson({ ok: true, markerChannelId: "chan" }));
		const { forwardDataApiPost } = await loadClient({ AUTH_KEY: "secret" });
		await expect(forwardDataApiPost("/v1/x", {})).resolves.toEqual({ ok: true, data: { ok: true, markerChannelId: "chan" } });

		fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "이미지는 10MB까지 가능해요." }));
		await expect(forwardDataApiPost("/v1/x", {})).resolves.toEqual({ ok: false, status: 400, message: "이미지는 10MB까지 가능해요." });

		fetchMock.mockResolvedValueOnce(jsonResponse(400, { message: "   " }));
		await expect(forwardDataApiPost("/v1/x", {})).resolves.toEqual({ ok: false, status: 400, message: null });
	});

	it("본문이 없으면 body·Content-Type을 보내지 않고, 네트워크 오류는 502로 정리해요", async () => {
		fetchMock.mockResolvedValueOnce(okJson({ ok: true }));
		const { forwardDataApiPost } = await loadClient({ AUTH_KEY: "secret" });
		await forwardDataApiPost("/v1/x", undefined);
		const init = fetchMock.mock.calls[0][1];
		expect(init.body).toBeUndefined();
		expect(init.headers).toEqual({ Authorization: "secret" });

		fetchMock.mockRejectedValueOnce(new Error("offline"));
		await expect(forwardDataApiPost("/v1/x", {})).resolves.toEqual({ ok: false, status: 502, message: null });
	});

	it("timeoutMs·method 옵션을 그대로 전달해요", async () => {
		fetchMock.mockResolvedValueOnce(okJson({ ok: true }));
		const { forwardDataApiPost } = await loadClient({ AUTH_KEY: "secret" });
		await forwardDataApiPost("/v1/x", { a: 1 }, { timeoutMs: 60_000, method: "PATCH" });
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("http://localhost:3002/v1/x");
		expect(init.method).toBe("PATCH");
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});
});

describe("forwardDataApiGet", () => {
	it("키가 없으면 503, 성공은 data, 실패는 status·message를 그대로 전달해요", async () => {
		const { forwardDataApiGet } = await loadClient({});
		await expect(forwardDataApiGet("/v1/guilds/1/channels")).resolves.toEqual({ ok: false, status: 503, message: null });

		const withKey = await loadClient({ AUTH_KEY: "secret" });
		fetchMock.mockResolvedValueOnce(okJson({ channels: [] }));
		await expect(withKey.forwardDataApiGet("/v1/guilds/1/channels")).resolves.toEqual({ ok: true, data: { channels: [] } });

		fetchMock.mockResolvedValueOnce(jsonResponse(502, { message: "봇이 응답하지 않아요." }));
		await expect(withKey.forwardDataApiGet("/v1/guilds/1/channels")).resolves.toEqual({ ok: false, status: 502, message: "봇이 응답하지 않아요." });

		fetchMock.mockRejectedValueOnce(new Error("offline"));
		await expect(withKey.forwardDataApiGet("/v1/guilds/1/channels")).resolves.toEqual({ ok: false, status: 502, message: null });
	});
});

describe("forwardDataApiImage", () => {
	it("image/* 응답은 ArrayBuffer와 content-type을 돌려줘요", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }),
		);
		const { forwardDataApiImage } = await loadClient({ AUTH_KEY: "secret" });
		const result = await forwardDataApiImage("/v1/render", {});
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.contentType).toBe("image/png");
		expect(new Uint8Array(await result.buffer)).toEqual(new Uint8Array([1, 2, 3]));
	});

	it("이미지가 아니거나 키가 없으면 실패로 정리해요", async () => {
		const { forwardDataApiImage } = await loadClient({ AUTH_KEY: "secret" });
		fetchMock.mockResolvedValueOnce(okJson({ not: "image" }));
		await expect(forwardDataApiImage("/v1/render", {})).resolves.toEqual({ ok: false, status: 502, message: null });

		const noKey = await loadClient({});
		await expect(noKey.forwardDataApiImage("/v1/render", {})).resolves.toEqual({ ok: false, status: 503, message: null });
	});
});

describe("dataApiFailResponse", () => {
	it("4xx는 data-api의 status·message를 살리고 5xx는 502로 낮춰요", async () => {
		const { dataApiFailResponse } = await loadClient({});
		const badRequest = dataApiFailResponse({ ok: false, status: 400, message: "이미지가 너무 커요." }, "실패했어요.");
		expect(badRequest.status).toBe(400);
		await expect(badRequest.json()).resolves.toEqual({ error: "이미지가 너무 커요." });

		const unavailable = dataApiFailResponse({ ok: false, status: 503, message: "Redis 장애" }, "실패했어요.");
		expect(unavailable.status).toBe(502);
		await expect(unavailable.json()).resolves.toEqual({ error: "Redis 장애" });

		const noMessage = dataApiFailResponse({ ok: false, status: 500, message: null }, "실패했어요.");
		expect(noMessage.status).toBe(502);
		await expect(noMessage.json()).resolves.toEqual({ error: "실패했어요." });
	});
});

describe("dataApiUserMessage", () => {
	it("한글 안내 메시지는 그대로 살려요", async () => {
		const { dataApiUserMessage } = await loadClient({});
		expect(dataApiUserMessage("이 서버의 알림 구독을 찾을 수 없어요.", "대체 문구")).toBe("이 서버의 알림 구독을 찾을 수 없어요.");
	});

	it("Fastify·HTTP 기술 원문과 빈 값은 fallback으로 바꿔요", async () => {
		const { dataApiUserMessage } = await loadClient({});
		expect(dataApiUserMessage("Route DELETE:/v1/guilds/1/social/subscriptions/x not found", "삭제하지 못했어요.")).toBe("삭제하지 못했어요.");
		expect(dataApiUserMessage(null, "삭제하지 못했어요.")).toBe("삭제하지 못했어요.");
		expect(dataApiUserMessage("   ", "삭제하지 못했어요.")).toBe("삭제하지 못했어요.");
	});
});

describe("notifyGuildSettingsChanged", () => {
	it("무효화 경로로 길드 ID만 보내고, mixer 사유는 함께 보내요", async () => {
		fetchMock.mockResolvedValue(okJson({ ok: true }));
		const { notifyGuildSettingsChanged } = await loadClient({ AUTH_KEY: "secret" });

		await expect(notifyGuildSettingsChanged("guild-1")).resolves.toBe(true);
		expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3002/v1/internal/guild-settings/invalidate");
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ guildId: "guild-1" });

		fetchMock.mockResolvedValueOnce(okJson({ ok: false }));
		await expect(notifyGuildSettingsChanged("guild-1", "mixer")).resolves.toBe(false);
		expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ guildId: "guild-1", reason: "mixer" });
	});
});
