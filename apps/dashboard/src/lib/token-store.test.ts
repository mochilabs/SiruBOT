// token-store 회귀 계약 — refresh 레이스·Redis 뮤텍스·낙관적 version 잠금을 잠가요.
// DB·Discord·Redis는 전부 목으로 대체하고 AUTH_SECRET만 실제 env로 줘요.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
	db: {
		userToken: {
			findUnique: vi.fn(),
			updateMany: vi.fn(),
			upsert: vi.fn(),
			deleteMany: vi.fn(),
		},
	},
}));
vi.mock("@/lib/discord-token", () => ({
	requestDiscordToken: vi.fn(),
}));
vi.mock("@/lib/redis", () => ({
	isRedisEnabled: vi.fn(),
	randomLockToken: vi.fn(() => "lock-a"),
	redisSetNx: vi.fn(),
	redisCompareAndDel: vi.fn(),
	redisGet: vi.fn(),
	redisSet: vi.fn(),
}));

import { db } from "@/lib/db";
import { requestDiscordToken } from "@/lib/discord-token";
import { isRedisEnabled, redisCompareAndDel, redisSetNx } from "@/lib/redis";

import { decryptToken, encryptToken, ensureFreshToken } from "./token-store";

const USER = "user-token-store";

/** DB 행 모형 — 실제 encryptToken으로 감싸 readTokenSet 복호 경로까지 검증해요 */
function tokenRow(opts: { version: number; expiresAtMs: number; accessToken?: string; refreshToken?: string }) {
	return {
		userId: USER,
		accessToken: encryptToken(opts.accessToken ?? "access-current"),
		refreshToken: encryptToken(opts.refreshToken ?? "refresh-current"),
		accessTokenExpiresAt: new Date(opts.expiresAtMs),
		updatedAt: new Date(0),
		version: opts.version,
	};
}

function okDiscordToken() {
	return {
		status: "ok" as const,
		token: {
			access_token: "access-new",
			refresh_token: "refresh-new",
			expires_in: 3600,
		},
	};
}

beforeEach(() => {
	process.env.AUTH_SECRET = "token-store-test-secret";
	vi.mocked(db.userToken.findUnique).mockReset();
	vi.mocked(db.userToken.updateMany).mockReset();
	vi.mocked(db.userToken.upsert).mockReset();
	vi.mocked(db.userToken.deleteMany).mockReset();
	vi.mocked(requestDiscordToken).mockReset();
	vi.mocked(isRedisEnabled).mockReturnValue(false);
	vi.mocked(redisSetNx).mockReset();
	vi.mocked(redisCompareAndDel).mockReset();
});

describe("encryptToken/decryptToken", () => {
	it("round-trip이 성립하고 깨진 복호문은 null을 돌려줘요", () => {
		const enc = encryptToken("hello");
		expect(enc).not.toContain("hello");
		expect(decryptToken(enc)).toBe("hello");
		expect(decryptToken("not:valid:base64")).toBeNull();
	});

	it("AUTH_SECRET이 없으면 암호화 없이 빈 문자열이에요", () => {
		const saved = process.env.AUTH_SECRET;
		delete process.env.AUTH_SECRET;
		delete process.env.NEXTAUTH_SECRET;
		try {
			expect(encryptToken("x")).toBe("");
			expect(decryptToken("x")).toBeNull();
		} finally {
			process.env.AUTH_SECRET = saved;
		}
	});
});

describe("ensureFreshToken", () => {
	it("fresh 토큰은 그대로 ok — Discord/뮤텍스를 건드리지 않아요", async () => {
		const row = tokenRow({ version: 2, expiresAtMs: Date.now() + 3_600_000 });
		vi.mocked(db.userToken.findUnique).mockResolvedValue(row);

		const result = await ensureFreshToken(USER);
		expect(result).toMatchObject({ status: "ok", accessToken: "access-current" });
		expect(requestDiscordToken).not.toHaveBeenCalled();
		expect(redisSetNx).not.toHaveBeenCalled();
	});

	it("행이 없고 legacy도 없으면 invalid예요", async () => {
		vi.mocked(db.userToken.findUnique).mockResolvedValue(null);
		expect(await ensureFreshToken(USER)).toEqual({ status: "invalid" });
	});

	it("legacy가 있으면 백필 후 그 값으로 판정해요", async () => {
		const fresh = tokenRow({ version: 1, expiresAtMs: Date.now() + 3_600_000, accessToken: "access-legacy" });
		vi.mocked(db.userToken.findUnique).mockResolvedValueOnce(null).mockResolvedValue(fresh);

		const result = await ensureFreshToken(USER, {
			refreshToken: "refresh-legacy",
			accessToken: "access-legacy",
			expiresAtMs: Date.now() + 3_600_000,
		});
		expect(result).toMatchObject({ status: "ok", accessToken: "access-legacy" });
		// 백필은 기존 행을 덮어쓰지 않는 no-op upsert 예요
		expect(db.userToken.upsert).toHaveBeenCalledWith(
			expect.objectContaining({ update: {} }),
		);
	});

	it("stale이면 fail-open 갱신 — 낙관적 version 증가로 기록해요", async () => {
		const stale = tokenRow({ version: 3, expiresAtMs: Date.now() - 1 });
		vi.mocked(db.userToken.findUnique).mockResolvedValue(stale);
		vi.mocked(requestDiscordToken).mockResolvedValue(okDiscordToken());
		vi.mocked(db.userToken.updateMany).mockResolvedValue({ count: 1 });

		const result = await ensureFreshToken(USER);
		expect(result).toMatchObject({ status: "ok", accessToken: "access-new" });
		expect(db.userToken.updateMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { userId: USER, version: 3 },
				data: expect.objectContaining({ version: { increment: 1 } }),
			}),
		);
	});

	it("낙관적 쓰기 경쟁 패배(count 0)면 승자 토큰을 채택해요", async () => {
		const stale = tokenRow({ version: 1, expiresAtMs: Date.now() - 1 });
		const winner = tokenRow({ version: 2, expiresAtMs: Date.now() + 3_600_000, accessToken: "access-winner" });
		vi.mocked(db.userToken.findUnique)
			.mockResolvedValueOnce(stale) // ensureFreshToken 최초 조회
			.mockResolvedValueOnce(stale) // performRefresh 권위 재조회
			.mockResolvedValueOnce(winner); // 경쟁 패배 후 승자 조회
		vi.mocked(requestDiscordToken).mockResolvedValue(okDiscordToken());
		vi.mocked(db.userToken.updateMany).mockResolvedValue({ count: 0 });

		const result = await ensureFreshToken(USER);
		expect(result).toMatchObject({ status: "ok", accessToken: "access-winner" });
	});

	it("refreshToken 폐기(invalid)에 version이 그대로면 행을 지우고 invalid예요", async () => {
		const stale = tokenRow({ version: 5, expiresAtMs: Date.now() - 1 });
		vi.mocked(db.userToken.findUnique).mockResolvedValue(stale);
		vi.mocked(requestDiscordToken).mockResolvedValue({ status: "invalid" });
		vi.mocked(db.userToken.deleteMany).mockResolvedValue({ count: 1 });

		expect(await ensureFreshToken(USER)).toEqual({ status: "invalid" });
		expect(db.userToken.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
	});

	it("폐기 판정이어도 version이 바뀌었으면(경쟁 패배) 승자를 채택해요", async () => {
		const stale = tokenRow({ version: 5, expiresAtMs: Date.now() - 1 });
		const winner = tokenRow({ version: 6, expiresAtMs: Date.now() + 3_600_000, accessToken: "access-winner" });
		vi.mocked(db.userToken.findUnique)
			.mockResolvedValueOnce(stale)
			.mockResolvedValueOnce(stale)
			.mockResolvedValueOnce(winner);
		vi.mocked(requestDiscordToken).mockResolvedValue({ status: "invalid" });

		const result = await ensureFreshToken(USER);
		expect(result).toMatchObject({ status: "ok", accessToken: "access-winner" });
		expect(db.userToken.deleteMany).not.toHaveBeenCalled();
	});

	it("Discord 일시 장애(unavailable)면 토큰을 유지하고 unavailable을 돌려줘요", async () => {
		const stale = tokenRow({ version: 7, expiresAtMs: Date.now() - 1 });
		vi.mocked(db.userToken.findUnique).mockResolvedValue(stale);
		vi.mocked(requestDiscordToken).mockResolvedValue({ status: "unavailable" });

		expect(await ensureFreshToken(USER)).toEqual({ status: "unavailable" });
		expect(db.userToken.deleteMany).not.toHaveBeenCalled();
	});

	it("Redis 뮤텍스 홀더 — 잡은 락으로 갱신하고 마지막에 해제해요", async () => {
		vi.mocked(isRedisEnabled).mockReturnValue(true);
		vi.mocked(redisSetNx).mockResolvedValue(true);
		const stale = tokenRow({ version: 9, expiresAtMs: Date.now() - 1 });
		vi.mocked(db.userToken.findUnique).mockResolvedValue(stale);
		vi.mocked(requestDiscordToken).mockResolvedValue(okDiscordToken());
		vi.mocked(db.userToken.updateMany).mockResolvedValue({ count: 1 });
		vi.mocked(redisCompareAndDel).mockResolvedValue(true);

		const result = await ensureFreshToken(USER);
		expect(result).toMatchObject({ status: "ok", accessToken: "access-new" });
		expect(redisSetNx).toHaveBeenCalledWith("refresh:" + USER, "lock-a", 12_000);
		expect(redisCompareAndDel).toHaveBeenCalledWith("refresh:" + USER, "lock-a");
	});

	it("Redis 뮤텍스 대기자 — 승자가 회전하면 Discord 호출 없이 승자를 채택해요", async () => {
		vi.mocked(isRedisEnabled).mockReturnValue(true);
		vi.mocked(redisSetNx).mockResolvedValue(false); // 남이 락을 잡고 있어요
		const stale = tokenRow({ version: 1, expiresAtMs: Date.now() - 1 });
		const winner = tokenRow({ version: 2, expiresAtMs: Date.now() + 3_600_000, accessToken: "access-winner" });
		vi.mocked(db.userToken.findUnique)
			.mockResolvedValueOnce(stale) // 대기 전 최초 조회
			.mockResolvedValueOnce(winner); // 폴링 1회차에서 승자 발견

		const result = await ensureFreshToken(USER);
		expect(result).toMatchObject({ status: "ok", accessToken: "access-winner" });
		expect(requestDiscordToken).not.toHaveBeenCalled();
	}, 15_000);
});