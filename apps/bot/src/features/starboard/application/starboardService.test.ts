import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STARBOARD_SETTINGS_DEFAULTS, type StarboardSettings } from '@sirubot/utils/starboard';
import {
	countStars,
	isStarboardEligible,
	STARBOARD_DEBOUNCE_MS,
	StarboardService,
	type StarboardDiscordPort,
	type StarboardSource
} from './starboardService.ts';

const GUILD = 'g1';
const STARBOARD = 'sb-channel';

const settings = (overrides: Partial<StarboardSettings> = {}): StarboardSettings => ({
	...STARBOARD_SETTINGS_DEFAULTS,
	channelId: STARBOARD,
	...overrides
});

const source = (overrides: Partial<StarboardSource> = {}): StarboardSource => ({
	guildId: GUILD,
	channelId: 'c1',
	messageId: 'm1',
	parentChannelId: null,
	channelNsfw: false,
	authorId: 'author',
	authorIsBot: false,
	isSystem: false,
	authorName: '작성자',
	authorAvatarUrl: null,
	content: '안녕',
	firstImageUrl: null,
	jumpUrl: 'https://discord.com/channels/g1/c1/m1',
	reactionCount: 3,
	authorReacted: false,
	...overrides
});

describe('countStars / isStarboardEligible (기준 판정)', () => {
	it('본인 반응 제외가 켜져 있으면 글쓴이의 반응을 빼고 세요', () => {
		expect(countStars(settings(), source({ reactionCount: 3, authorReacted: true }))).toBe(2);
		expect(countStars(settings({ excludeSelf: false }), source({ reactionCount: 3, authorReacted: true }))).toBe(3);
		expect(countStars(settings(), source({ reactionCount: 0, authorReacted: false }))).toBe(0);
	});

	it('기준 수 미만이면 올리지 않아요', () => {
		expect(isStarboardEligible(settings({ threshold: 3 }), source(), 2)).toBe(false);
		expect(isStarboardEligible(settings({ threshold: 3 }), source(), 3)).toBe(true);
	});

	it('NSFW 채널은 제외 옵션이 켜져 있을 때만 막아요', () => {
		expect(isStarboardEligible(settings(), source({ channelNsfw: true }), 5)).toBe(false);
		expect(isStarboardEligible(settings({ excludeNsfw: false }), source({ channelNsfw: true }), 5)).toBe(true);
	});

	it('무시 채널(스레드는 부모 채널 포함)과 스타보드 채널, 봇·시스템 메시지는 대상이 아니에요', () => {
		const s = settings({ ignoredChannelIds: ['ignored'] });
		expect(isStarboardEligible(s, source({ channelId: 'ignored' }), 5)).toBe(false);
		expect(isStarboardEligible(s, source({ channelId: 'thread', parentChannelId: 'ignored' }), 5)).toBe(false);
		expect(isStarboardEligible(s, source({ channelId: STARBOARD }), 5)).toBe(false);
		expect(isStarboardEligible(s, source({ authorIsBot: true }), 5)).toBe(false);
		expect(isStarboardEligible(s, source({ isSystem: true }), 5)).toBe(false);
		expect(isStarboardEligible(s, source(), 5)).toBe(true);
	});

	it('스타보드 채널이 없으면(꺼짐) 올리지 않아요', () => {
		expect(isStarboardEligible(settings({ channelId: null }), source(), 5)).toBe(false);
	});
});

interface EntryRow {
	sourceMessageId: string;
	guildId: string;
	starboardChannelId: string;
	starboardMessageId: string;
	count: number;
}

describe('StarboardService', () => {
	let entries: Map<string, EntryRow>;
	let currentSettings: StarboardSettings;
	let current: StarboardSource | null;
	let discord: { [K in keyof StarboardDiscordPort]: ReturnType<typeof vi.fn> };
	let recordUsage: ReturnType<typeof vi.fn<(guildId: string) => void>>;
	let service: StarboardService;

	const ref = { guildId: GUILD, channelId: 'c1', messageId: 'm1' };
	const star = { id: null, name: '⭐' };
	const settle = () => vi.advanceTimersByTimeAsync(STARBOARD_DEBOUNCE_MS);
	const seedEntry = (count: number) =>
		entries.set('m1', { sourceMessageId: 'm1', guildId: GUILD, starboardChannelId: STARBOARD, starboardMessageId: 'sb-msg-1', count });

	beforeEach(() => {
		vi.useFakeTimers();
		entries = new Map();
		currentSettings = settings();
		current = source();
		discord = {
			fetchSource: vi.fn(async () => current),
			publish: vi.fn(async () => 'sb-msg-1'),
			update: vi.fn(async () => 'ok' as const),
			remove: vi.fn(async () => undefined)
		};
		recordUsage = vi.fn<(guildId: string) => void>();
		const db = {
			starboardSettings: { findUnique: vi.fn(async () => ({ guildId: GUILD, ...currentSettings })) },
			starboardEntry: {
				findUnique: vi.fn(async ({ where }: { where: { sourceMessageId: string } }) => entries.get(where.sourceMessageId) ?? null),
				create: vi.fn(async ({ data }: { data: EntryRow }) => {
					entries.set(data.sourceMessageId, data);
					return data;
				}),
				update: vi.fn(async ({ where, data }: { where: { sourceMessageId: string }; data: { count: number } }) => {
					const entry = entries.get(where.sourceMessageId)!;
					entry.count = data.count;
					return entry;
				}),
				findMany: vi.fn(async ({ where }: { where: { sourceMessageId: { in: string[] } } }) =>
					[...entries.values()].filter((entry) => where.sourceMessageId.in.includes(entry.sourceMessageId))
				),
				deleteMany: vi.fn(async ({ where }: { where: { sourceMessageId: { in: string[] } } }) => {
					for (const id of where.sourceMessageId.in) entries.delete(id);
					return { count: where.sourceMessageId.in.length };
				})
			}
		};
		const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
		service = new StarboardService({ db: db as never, logger, discord: discord as unknown as StarboardDiscordPort, recordUsage });
	});

	afterEach(async () => {
		await service.stop();
		vi.useRealTimers();
	});

	it('기준 이상이면 스타보드에 한 번 올리고 사용 지표를 남겨요', async () => {
		await service.schedule(ref, star);
		await settle();

		expect(discord.publish).toHaveBeenCalledTimes(1);
		expect(discord.publish).toHaveBeenCalledWith(STARBOARD, current, 3, '⭐');
		expect(entries.get('m1')).toMatchObject({ starboardMessageId: 'sb-msg-1', starboardChannelId: STARBOARD, count: 3 });
		expect(recordUsage).toHaveBeenCalledWith(GUILD);
	});

	it('설정과 다른 이모지 반응은 무시해요', async () => {
		await service.schedule(ref, { id: null, name: '🌟' });
		await settle();
		expect(discord.fetchSource).not.toHaveBeenCalled();
	});

	it('기준 미만이면 올리지 않아요', async () => {
		current = source({ reactionCount: 2 });
		await service.schedule(ref, star);
		await settle();
		expect(discord.publish).not.toHaveBeenCalled();
		expect(entries.size).toBe(0);
	});

	it('2초 안의 연속 반응은 한 번만 처리해요 (디바운스)', async () => {
		seedEntry(3);
		current = source({ reactionCount: 6 });
		for (let i = 0; i < 5; i++) {
			await service.schedule(ref, star);
			await vi.advanceTimersByTimeAsync(500);
		}
		expect(discord.update).not.toHaveBeenCalled();
		await settle();

		expect(discord.fetchSource).toHaveBeenCalledTimes(1);
		expect(discord.update).toHaveBeenCalledTimes(1);
		expect(discord.update).toHaveBeenCalledWith(STARBOARD, 'sb-msg-1', current, 6, '⭐');
		expect(entries.get('m1')?.count).toBe(6);
	});

	it('기준 아래로 떨어져도 스타보드 글을 지우지 않고 수만 고쳐요', async () => {
		seedEntry(3);
		current = source({ reactionCount: 1 });
		await service.schedule(ref, star);
		await settle();

		expect(discord.remove).not.toHaveBeenCalled();
		expect(discord.update).toHaveBeenCalledWith(STARBOARD, 'sb-msg-1', current, 1, '⭐');
		expect(entries.get('m1')?.count).toBe(1);
	});

	it('수가 그대로면 수정하지 않아요', async () => {
		seedEntry(3);
		await service.schedule(ref, star);
		await settle();
		expect(discord.update).not.toHaveBeenCalled();
	});

	it('스타보드 채널 안의 메시지와 무시 채널의 메시지는 예약하지 않아요', async () => {
		currentSettings = settings({ ignoredChannelIds: ['c9'] });
		await service.schedule({ ...ref, channelId: STARBOARD }, star);
		await service.schedule({ ...ref, channelId: 'c9' }, star);
		await settle();
		expect(discord.fetchSource).not.toHaveBeenCalled();
	});

	it('원문이 지워지면 스타보드 글을 지우고 기록도 지워요', async () => {
		seedEntry(3);
		await service.handleSourcesDeleted(GUILD, ['m1', 'other']);

		expect(discord.remove).toHaveBeenCalledTimes(1);
		expect(discord.remove).toHaveBeenCalledWith(STARBOARD, 'sb-msg-1');
		expect(entries.has('m1')).toBe(false);
	});

	it('원문이 지워지면 걸려 있던 예약도 취소해요', async () => {
		await service.schedule(ref, star);
		await service.handleSourcesDeleted(GUILD, ['m1']);
		await settle();
		expect(discord.fetchSource).not.toHaveBeenCalled();
	});

	it('스타보드 글을 누가 지웠으면 다시 올리지 않아요', async () => {
		seedEntry(3);
		discord.update.mockResolvedValue('gone');
		current = source({ reactionCount: 5 });
		await service.schedule(ref, star);
		await settle();
		expect(discord.publish).not.toHaveBeenCalled();
	});

	it('stop 이후에는 새 예약을 받지 않아요', async () => {
		await service.stop();
		await service.schedule(ref, star);
		await settle();
		expect(discord.fetchSource).not.toHaveBeenCalled();
	});
});
