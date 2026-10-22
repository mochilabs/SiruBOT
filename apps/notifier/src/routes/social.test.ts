import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { PrismaClient } from '@sirubot/prisma';
import subscriptionRoutes from './social.ts';
import { requireAuth } from '../plugins/auth.ts';
import type { SocialWebhookHub } from '../services/webhookHub.ts';
import type { TwitchApiClient } from '../services/twitchApi.ts';
import type { NotifierRedis } from '../services/redis.ts';

const AUTH_KEY = 'notifier-test-key';
const GUILD_A = '100000000000000001';
const GUILD_B = '200000000000000002';
const CHANNEL_ID = '300000000000000003';
const SUB_ID = 'd7a1f3c5-2b8e-4a9d-8f61-3c2b5e7a9d41';

interface Row {
	id: string;
	guildId: string;
	platform: string;
	sourcePlatformId: string;
	sourceName: string;
	targetChannelId: string;
	webhookId: string;
	webhookToken: string;
	messageTemplate: string | null;
	webhookName: string | null;
	webhookAvatarUrl: string | null;
	status: string;
	createdAt: Date;
	updatedAt: Date;
}

function makeRow(guildId: string, overrides: Partial<Row> = {}): Row {
	return {
		id: SUB_ID,
		guildId,
		platform: 'chzzk',
		sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
		sourceName: '시루',
		targetChannelId: CHANNEL_ID,
		webhookId: 'webhook-id-0001',
		webhookToken: 'webhook-token-0001',
		messageTemplate: null,
		webhookName: null,
		webhookAvatarUrl: null,
		status: 'active',
		createdAt: new Date('2026-10-01T00:00:00Z'),
		updatedAt: new Date('2026-10-02T00:00:00Z'),
		...overrides
	};
}

/** Prisma 소유권 where({id, guildId})와 P2025 동작을 흉내내는 인메모리 구독 저장소 */
function makeDb(rows: Row[]) {
	const prismaError = (code: string) => Object.assign(new Error(`prisma error ${code}`), { code });
	return {
		socialSubscription: {
			findMany: vi.fn(async ({ where }: { where: { guildId: string } }) => rows.filter((row) => row.guildId === where.guildId)),
			findFirst: vi.fn(
				async ({ where }: { where: { id: string; guildId: string } }) =>
					rows.find((row) => row.id === where.id && row.guildId === where.guildId) ?? null
			),
			count: vi.fn(
				async ({ where }: { where: { platform: string; sourcePlatformId: string; status: string; id: { not: string } } }) =>
					rows.filter(
						(row) =>
							row.platform === where.platform &&
							row.sourcePlatformId === where.sourcePlatformId &&
							row.status === where.status &&
							row.id !== where.id.not
					).length
			),
			update: vi.fn(async ({ where, data }: { where: { id: string; guildId: string }; data: Partial<Row> }) => {
				const row = rows.find((candidate) => candidate.id === where.id && candidate.guildId === where.guildId);
				if (!row) throw prismaError('P2025');
				Object.assign(row, data, { updatedAt: new Date('2026-10-03T00:00:00Z') });
				return row;
			}),
			delete: vi.fn(async ({ where }: { where: { id: string } }) => {
				const index = rows.findIndex((candidate) => candidate.id === where.id);
				if (index < 0) throw prismaError('P2025');
				return rows.splice(index, 1)[0];
			}),
			create: vi.fn(async ({ data }: { data: Row }) => {
				const row = makeRow(data.guildId, data);
				rows.push(row);
				return row;
			})
		}
	} as unknown as PrismaClient;
}

async function buildApp(options: {
	db: PrismaClient | null;
	twitchClient?: TwitchApiClient | null;
	redis?: { get: ReturnType<typeof vi.fn>; del: ReturnType<typeof vi.fn> };
}) {
	const app = Fastify();
	const hub = {
		requestWebhookCreate: vi.fn(async () => ({ requestId: 'req-1', guildId: GUILD_A, webhookId: 'wh-1', webhookToken: 'token-1' }))
	} as unknown as SocialWebhookHub;
	const redis = options.redis ?? { get: vi.fn(async () => null), del: vi.fn(async () => {}) };
	await subscriptionRoutes(app, {
		guard: requireAuth(AUTH_KEY),
		getDb: () => options.db,
		hub,
		twitchClient: options.twitchClient ?? null,
		redis: redis as unknown as NotifierRedis,
		fetchFn: vi.fn(async () => new Response(null, { status: 204 }))
	});
	await app.ready();
	return app;
}

const authHeader = { authorization: AUTH_KEY };

describe('social routes', () => {
	let app: FastifyInstance;
	const appsToClose: FastifyInstance[] = [];

	async function build(options: Parameters<typeof buildApp>[0]): Promise<FastifyInstance> {
		const app = await buildApp(options);
		appsToClose.push(app);
		return app;
	}

	afterEach(async () => {
		await Promise.all(appsToClose.splice(0).map((instance) => instance.close()));
	});

	it('rejects unauthenticated requests', async () => {
		app = await build({ db: makeDb([]) });
		const response = await app.inject({ method: 'GET', url: `/v1/guilds/${GUILD_A}/social/subscriptions` });
		expect(response.statusCode).toBe(401);
	});

	it('lists subscriptions scoped to the guild and never exposes webhook credentials', async () => {
		const db = makeDb([makeRow(GUILD_A), makeRow(GUILD_B, { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })]);
		app = await build({ db });
		const response = await app.inject({ method: 'GET', url: `/v1/guilds/${GUILD_A}/social/subscriptions`, headers: authHeader });
		expect(response.statusCode).toBe(200);
		expect(db.socialSubscription.findMany).toHaveBeenCalledWith({ where: { guildId: GUILD_A }, orderBy: { createdAt: 'desc' } });
		const body = response.json() as { subscriptions: Record<string, unknown>[] };
		expect(body.subscriptions).toHaveLength(1);
		expect(body.subscriptions[0]).toMatchObject({ id: SUB_ID, guildId: GUILD_A });
		expect(body.subscriptions[0]).not.toHaveProperty('webhookId');
		expect(body.subscriptions[0]).not.toHaveProperty('webhookToken');
	});

	it('returns 500 with logging path when the listing query fails', async () => {
		const db = makeDb([]);
		vi.mocked(db.socialSubscription.findMany).mockRejectedValueOnce(new Error('db down'));
		app = await build({ db });
		const response = await app.inject({ method: 'GET', url: `/v1/guilds/${GUILD_A}/social/subscriptions`, headers: authHeader });
		expect(response.statusCode).toBe(500);
		expect(response.json()).toMatchObject({ error: 'internal_error' });
	});

	it('creates a subscription with the guild from the path', async () => {
		const db = makeDb([]);
		app = await build({ db });
		const response = await app.inject({
			method: 'POST',
			url: `/v1/guilds/${GUILD_A}/social/subscriptions`,
			headers: authHeader,
			payload: { platform: 'chzzk', sourcePlatformId: 'a1b2c3d4e5f60718293a4b5c6d7e8f90', sourceName: '시루', targetChannelId: CHANNEL_ID }
		});
		expect(response.statusCode).toBe(200);
		expect(response.json()).toMatchObject({ subscription: { guildId: GUILD_A, platform: 'chzzk' } });
	});

	it('updates only the owning guild subscription', async () => {
		const db = makeDb([makeRow(GUILD_A)]);
		app = await build({ db });
		const response = await app.inject({
			method: 'PATCH',
			url: `/v1/guilds/${GUILD_A}/social/subscriptions/${SUB_ID}`,
			headers: authHeader,
			payload: { messageTemplate: '새 템플릿' }
		});
		expect(response.statusCode).toBe(200);
		expect(db.socialSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: SUB_ID, guildId: GUILD_A } }));
		expect(response.json()).toMatchObject({ subscription: { messageTemplate: '새 템플릿' } });
	});

	it('returns 404 when patching another guild subscription (IDOR)', async () => {
		const db = makeDb([makeRow(GUILD_B)]);
		app = await build({ db });
		const response = await app.inject({
			method: 'PATCH',
			url: `/v1/guilds/${GUILD_A}/social/subscriptions/${SUB_ID}`,
			headers: authHeader,
			payload: { messageTemplate: '남의 길드 침입' }
		});
		expect(response.statusCode).toBe(404);
		expect(response.json()).toMatchObject({ error: 'subscription_not_found' });
		// 소유권 검증은 쿼리 스코프 where: { id, guildId } 안에서 이뤄져요.
		expect(db.socialSubscription.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: SUB_ID, guildId: GUILD_A } }));
	});

	it('validates guild and subscription id formats on PATCH', async () => {
		app = await build({ db: makeDb([]) });
		const badGuild = await app.inject({
			method: 'PATCH',
			url: `/v1/guilds/!!!/social/subscriptions/${SUB_ID}`,
			headers: authHeader,
			payload: { status: 'disabled' }
		});
		expect(badGuild.statusCode).toBe(400);
		const badId = await app.inject({
			method: 'PATCH',
			url: `/v1/guilds/${GUILD_A}/social/subscriptions/not-a-uuid`,
			headers: authHeader,
			payload: { status: 'disabled' }
		});
		expect(badId.statusCode).toBe(400);
	});

	it('deletes only the owning guild subscription and cleans up the webhook', async () => {
		const rows = [makeRow(GUILD_A)];
		const db = makeDb(rows);
		app = await build({ db });
		const response = await app.inject({ method: 'DELETE', url: `/v1/guilds/${GUILD_A}/social/subscriptions/${SUB_ID}`, headers: authHeader });
		expect(response.statusCode).toBe(200);
		expect(response.json()).toEqual({ ok: true });
		expect(db.socialSubscription.delete).toHaveBeenCalledWith({ where: { id: SUB_ID } });
		expect(rows).toHaveLength(0);
	});

	it('returns 404 when deleting another guild subscription (IDOR)', async () => {
		const rows = [makeRow(GUILD_B)];
		const db = makeDb(rows);
		app = await build({ db });
		const response = await app.inject({ method: 'DELETE', url: `/v1/guilds/${GUILD_A}/social/subscriptions/${SUB_ID}`, headers: authHeader });
		expect(response.statusCode).toBe(404);
		expect(response.json()).toMatchObject({ error: 'subscription_not_found' });
		expect(db.socialSubscription.delete).not.toHaveBeenCalled();
		expect(rows).toHaveLength(1);
	});

	it('releases the shared twitch EventSub subscription only for the last active guild', async () => {
		const twitchRow = makeRow(GUILD_A, { platform: 'twitch', sourcePlatformId: '999888777' });
		const db = makeDb([
			twitchRow,
			makeRow(GUILD_B, { platform: 'twitch', sourcePlatformId: '999888777', id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' })
		]);
		const redis = { get: vi.fn(async () => JSON.stringify({ subscriptionId: 'evt-sub-1', createdAt: 1 })), del: vi.fn(async () => {}) };
		const twitchClient = { deleteSubscription: vi.fn(async () => true) } as unknown as TwitchApiClient;
		app = await build({ db, twitchClient, redis });

		const shared = await app.inject({ method: 'DELETE', url: `/v1/guilds/${GUILD_A}/social/subscriptions/${SUB_ID}`, headers: authHeader });
		expect(shared.statusCode).toBe(200);
		await vi.waitFor(() => expect(db.socialSubscription.delete).toHaveBeenCalled());
		// 다른 길드가 아직 활성 구독 중 — EventSub 구독은 유지해요.
		expect(twitchClient.deleteSubscription).not.toHaveBeenCalled();

		const last = await app.inject({
			method: 'DELETE',
			url: `/v1/guilds/${GUILD_B}/social/subscriptions/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`,
			headers: authHeader
		});
		expect(last.statusCode).toBe(200);
		await vi.waitFor(() => expect(twitchClient.deleteSubscription).toHaveBeenCalledWith('evt-sub-1'));
		await vi.waitFor(() => expect(redis.del).toHaveBeenCalledWith('sirubot:social:twitch:sub:999888777'));
	});

	it('returns 503 when the database is not connected', async () => {
		app = await build({ db: null });
		const response = await app.inject({ method: 'DELETE', url: `/v1/guilds/${GUILD_A}/social/subscriptions/${SUB_ID}`, headers: authHeader });
		expect(response.statusCode).toBe(503);
	});
});
