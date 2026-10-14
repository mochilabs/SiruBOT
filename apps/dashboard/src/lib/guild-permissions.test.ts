// guild-permissions 회귀 계약 — 3상태 판정, 권한 캐시 TTL, 단일 비행을 잠가요.
// Discord fetch는 전역 목으로 대체하고, Redis는 꺼둔 상태로 시작해요(테스트별로 전환).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
	isRedisEnabled: vi.fn(),
	redisGet: vi.fn(),
	redisSet: vi.fn(),
}));

import { isRedisEnabled, redisGet } from "@/lib/redis";

import {
	hasManageablePermissions,
	resolveCanManage,
	resolveGuildMembership,
	resolveGuildMeta,
} from "./guild-permissions";

/** 단일 비행/캐시(Map)가 테스트 간 섞이지 않게 유저·길드 조합을 새로 만들어요 */
let seq = 0;
const freshIds = () => ({ userId: `user-${++seq}`, guildId: `guild-${seq}` });

/** Date.now를 제어해 캐시 TTL(ok 60s / unavailable 10s)을 결정적으로 흘려요 */
let fakeNowMs = 0;
let dateSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
	fakeNowMs = Date.parse("2026-10-14T12:00:00Z");
	dateSpy = vi.spyOn(Date, "now").mockImplementation(() => fakeNowMs);
	vi.stubGlobal("fetch", vi.fn());
	vi.mocked(isRedisEnabled).mockReturnValue(false);
	vi.mocked(redisGet).mockReset();
});

afterEach(() => {
	dateSpy?.mockRestore();
	dateSpy = null;
	vi.unstubAllGlobals();
});

function discordGuildsResponse(
	guilds: Array<{ id: string; name?: string; icon?: string | null; permissions: string | number }>,
) {
	return {
		ok: true,
		status: 200,
		json: async () => guilds,
	} as unknown as Response;
}

function statusResponse(status: number) {
	return { ok: status >= 200 && status < 300, status, json: async () => ({}) } as unknown as Response;
}

const fetchMock = () => vi.mocked(fetch);

describe("hasManageablePermissions", () => {
	it("Manage Guild(0x20)·Administrator(0x8) 비트를 관리 권한으로 인정해요", () => {
		expect(hasManageablePermissions("32")).toBe(true);
		expect(hasManageablePermissions(0x20)).toBe(true);
		expect(hasManageablePermissions("8")).toBe(true);
		expect(hasManageablePermissions("40")).toBe(true); // 0x20 | 0x8
		expect(hasManageablePermissions("0")).toBe(false);
		expect(hasManageablePermissions("1024")).toBe(false);
		expect(hasManageablePermissions("not-a-number")).toBe(false);
	});
});

describe("resolveCanManage — Discord 3상태 판정", () => {
	it("정상 응답은 권한 비트로 manageable을 판정해요", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockResolvedValue(
			discordGuildsResponse([
				{ id: guildId, permissions: "1024" },
				{ id: "other", permissions: "32" },
			]),
		);

		expect(await resolveCanManage("token", userId, guildId)).toEqual({ status: "ok", manageable: false });
	});

	it("401은 invalid-token(재로그인 필요)로 분류해요", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockResolvedValue(statusResponse(401));
		expect(await resolveCanManage("token", userId, guildId)).toEqual({ status: "invalid-token" });
	});

	it("429는 unavailable이고 재시도하지 않아요 (1회 호출)", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockResolvedValue(statusResponse(429));
		expect(await resolveCanManage("token", userId, guildId)).toEqual({ status: "unavailable" });
		expect(fetchMock()).toHaveBeenCalledTimes(1);
	});

	it("5xx는 unavailable로 1회만 더 시도해요 (2회 호출)", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockResolvedValue(statusResponse(500));
		expect(await resolveCanManage("token", userId, guildId)).toEqual({ status: "unavailable" });
		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});

	it("네트워크 오류도 unavailable로 1회만 더 시도해요", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockRejectedValue(new Error("network down"));
		expect(await resolveCanManage("token", userId, guildId)).toEqual({ status: "unavailable" });
		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});
});

describe("권한 캐시 TTL", () => {
	it("ok 결과는 60초 안에 재호출하지 않고, 지나면 다시 조회해요", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockImplementation(async () =>
			discordGuildsResponse([{ id: guildId, permissions: "32", name: "서버", icon: "icon" }]),
		);

		await resolveCanManage("token", userId, guildId);
		await resolveCanManage("token", userId, guildId);
		expect(fetchMock()).toHaveBeenCalledTimes(1);

		fakeNowMs += 60_001;
		await resolveCanManage("token", userId, guildId);
		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});

	it("unavailable 결과는 10초만 캐시해요", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockResolvedValue(statusResponse(429));

		await resolveCanManage("token", userId, guildId);
		fakeNowMs += 5_000;
		await resolveCanManage("token", userId, guildId);
		expect(fetchMock()).toHaveBeenCalledTimes(1);

		fakeNowMs += 10_001;
		await resolveCanManage("token", userId, guildId);
		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});

	it("invalid-token은 캐시하지 않아요 (재로그인 즉시 회복)", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockResolvedValue(statusResponse(401));

		await resolveCanManage("token", userId, guildId);
		await resolveCanManage("token", userId, guildId);
		expect(fetchMock()).toHaveBeenCalledTimes(2);
	});
});

describe("단일 비행 — 같은 user:guild 조회는 Discord 호출 하나로 합쳐요", () => {
	it("권한 확인과 메타 조회가 동시에 와도 fetch는 1회예요", async () => {
		const { userId, guildId } = freshIds();
		let resolveFetch!: (value: Response) => void;
		fetchMock().mockImplementation(
			() =>
				new Promise<Response>((resolve) => {
					resolveFetch = resolve;
				}),
		);

		const managePromise = resolveCanManage("token", userId, guildId);
		const metaPromise = resolveGuildMeta("token", userId, guildId);
		// 첫 비행이 fetch를 호출할 때까지 마이크로태스크를 흘려요
		await new Promise((resolve) => setTimeout(resolve, 0));
		resolveFetch(
			discordGuildsResponse([{ id: guildId, permissions: "32", name: "시루 서버", icon: "abc" }]),
		);

		const [manage, meta] = await Promise.all([managePromise, metaPromise]);
		expect(fetchMock()).toHaveBeenCalledTimes(1);
		expect(manage).toEqual({ status: "ok", manageable: true });
		expect(meta).toEqual({ name: "시루 서버", icon: "abc" });
	});

	it("멤버십 확인도 같은 비행/캐시를 공유해요", async () => {
		const { userId, guildId } = freshIds();
		fetchMock().mockImplementation(async () =>
			discordGuildsResponse([{ id: guildId, permissions: "1024", name: "서버", icon: null }]),
		);

		const membership = await resolveGuildMembership("token", userId, guildId);
		expect(membership).toEqual({ status: "ok", isMember: true });

		await resolveCanManage("token", userId, guildId);
		expect(fetchMock()).toHaveBeenCalledTimes(1);
	});
});

describe("Redis 공유 캐시", () => {
	it("다른 인스턴스가 캐시한 결과는 Discord 호출 없이 재사용해요", async () => {
		const { userId, guildId } = freshIds();
		vi.mocked(isRedisEnabled).mockReturnValue(true);
		vi.mocked(redisGet).mockResolvedValue(
			JSON.stringify({
				result: { status: "ok", manageable: true },
				meta: { name: "캐시된 서버", icon: "cached" },
			}),
		);

		const manage = await resolveCanManage("token", userId, guildId);
		expect(manage).toEqual({ status: "ok", manageable: true });
		expect(fetchMock()).not.toHaveBeenCalled();
	});

	it("Redis 읽기가 깨진 값이면 미스로 취급해 Discord를 조회해요 (fail-open)", async () => {
		const { userId, guildId } = freshIds();
		vi.mocked(isRedisEnabled).mockReturnValue(true);
		vi.mocked(redisGet).mockResolvedValue("not-json{");
		fetchMock().mockImplementation(async () =>
			discordGuildsResponse([{ id: guildId, permissions: "32", name: "폴백", icon: null }]),
		);

		const manage = await resolveCanManage("token", userId, guildId);
		expect(manage).toEqual({ status: "ok", manageable: true });
		expect(fetchMock()).toHaveBeenCalledTimes(1);
	});
});