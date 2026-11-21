import type { PrismaClient } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';
import { STARBOARD_SETTINGS_DEFAULTS, starboardEmojiMatches, type StarboardSettings } from '@sirubot/utils/starboard';
import type { AppLogger } from '../../../lib/appLogger.ts';
import { KeyedTimers } from '../../../lib/keyedTimers.ts';
import type { Stoppable } from '../../../lib/lifecycle.ts';

/** 같은 메시지에 반응이 몰려도 이 시간 동안 조용해진 뒤 한 번만 처리해요 */
export const STARBOARD_DEBOUNCE_MS = 2_000;
const SETTINGS_TTL_MS = 60_000;

/** 원문 메시지를 가리키는 최소 정보 */
export interface StarboardMessageRef {
	guildId: string;
	channelId: string;
	messageId: string;
}

/** 스타보드 카드를 그리는 데 필요한 원문의 사본 — Discord 객체 대신 이 값만 application에 들어와요 */
export interface StarboardSource extends StarboardMessageRef {
	/** 스레드면 부모 채널 ID — 무시 채널 판정에 같이 써요 */
	parentChannelId: string | null;
	channelNsfw: boolean;
	authorId: string;
	authorIsBot: boolean;
	/** 시스템 메시지(입장 알림 등) */
	isSystem: boolean;
	authorName: string;
	authorAvatarUrl: string | null;
	content: string;
	firstImageUrl: string | null;
	jumpUrl: string;
	/** 설정 이모지가 달린 수 (본인 반응 포함) */
	reactionCount: number;
	/** 글쓴이가 그 이모지를 달았는지. needAuthorStarred를 켠 조회에서만 정확해요 */
	authorReacted: boolean;
}

export type StarboardUpdateResult = 'ok' | 'gone' | 'failed';

/** 스타보드가 Discord와 주고받는 포트 — 실제 구현은 features/starboard/discord/starboardDiscord.ts예요 */
export interface StarboardDiscordPort {
	/** 원문을 새로 읽어요. 지워졌거나 못 읽으면 null */
	fetchSource(ref: StarboardMessageRef, emoji: string, options: { needAuthorStarred: boolean }): Promise<StarboardSource | null>;
	/** 스타보드 글을 올리고 메시지 ID를 돌려줘요. 못 올리면 null */
	publish(channelId: string, source: StarboardSource, count: number, emoji: string): Promise<string | null>;
	update(channelId: string, messageId: string, source: StarboardSource, count: number, emoji: string): Promise<StarboardUpdateResult>;
	remove(channelId: string, messageId: string): Promise<void>;
}

export interface StarboardServiceDeps {
	db: Pick<PrismaClient, 'starboardSettings' | 'starboardEntry'>;
	logger: AppLogger;
	discord: StarboardDiscordPort;
	/** 스타보드 글을 올릴 때 사용 지표로 남겨요 */
	recordUsage?: (guildId: string) => void;
}

/** 설정과 원문으로 센 별 수 — 본인 반응 제외 옵션을 적용해요 */
export function countStars(
	settings: Pick<StarboardSettings, 'excludeSelf'>,
	source: Pick<StarboardSource, 'reactionCount' | 'authorReacted'>
): number {
	const own = settings.excludeSelf && source.authorReacted ? 1 : 0;
	return Math.max(0, source.reactionCount - own);
}

/**
 * 새로 스타보드에 올려도 되는 원문인지 — 기준 수, 봇·시스템 메시지, 스타보드 채널, 무시 채널, NSFW를 본다.
 * 이미 올라간 글의 수 갱신에는 쓰지 않아요 (D-16: 기준 아래로 떨어져도 글은 남겨요).
 */
export function isStarboardEligible(settings: StarboardSettings, source: StarboardSource, stars: number): boolean {
	if (!settings.channelId) return false;
	if (stars < settings.threshold) return false;
	if (source.authorIsBot || source.isSystem) return false;
	if (source.channelId === settings.channelId) return false;
	if (settings.ignoredChannelIds.includes(source.channelId)) return false;
	if (source.parentChannelId && settings.ignoredChannelIds.includes(source.parentChannelId)) return false;
	if (settings.excludeNsfw && source.channelNsfw) return false;
	return true;
}

export class StarboardService implements Stoppable {
	public readonly name = '스타보드 갱신';
	private readonly timers = new KeyedTimers('스타보드 갱신 디바운스');
	private readonly settingsCache = new MemoryCache<string, StarboardSettings>({ ttl: SETTINGS_TTL_MS, maxSize: 500 });
	/** 처리 중인 원문 — 처리 도중 새 반응이 오면 끝난 뒤 다시 걸어요 */
	private readonly running = new Set<string>();
	private readonly inflight = new Set<Promise<void>>();
	private stopped = false;

	public constructor(private readonly deps: StarboardServiceDeps) {}

	public async getSettings(guildId: string): Promise<StarboardSettings> {
		const cached = this.settingsCache.get(guildId);
		if (cached) return cached;
		const row = await this.deps.db.starboardSettings.findUnique({ where: { guildId } });
		const settings: StarboardSettings = row
			? {
					channelId: row.channelId,
					emoji: row.emoji,
					threshold: row.threshold,
					excludeSelf: row.excludeSelf,
					excludeNsfw: row.excludeNsfw,
					ignoredChannelIds: row.ignoredChannelIds
				}
			: STARBOARD_SETTINGS_DEFAULTS;
		this.settingsCache.set(guildId, settings);
		return settings;
	}

	/** 대시보드 저장 후 설정 캐시를 비워요 */
	public invalidateSettings(guildId: string): void {
		this.settingsCache.delete(guildId);
	}

	/**
	 * 반응이 바뀐 메시지를 디바운스로 예약해요. 기능이 꺼졌거나 이모지가 다르거나 스타보드·무시 채널의 메시지면 건너뛰어요.
	 * emoji를 주지 않으면(반응 전체 삭제) 이모지 비교를 하지 않아요.
	 */
	public async schedule(ref: StarboardMessageRef, emoji?: { id: string | null; name: string | null }): Promise<void> {
		if (this.stopped) return;
		const settings = await this.getSettings(ref.guildId);
		if (!settings.channelId) return;
		if (emoji && !starboardEmojiMatches(settings.emoji, emoji)) return;
		if (ref.channelId === settings.channelId || settings.ignoredChannelIds.includes(ref.channelId)) return;
		this.timers.set(ref.messageId, () => this.run(ref), STARBOARD_DEBOUNCE_MS);
	}

	/** 원문이 지워졌어요 — 스타보드 글도 지워요 (원문이 지워질 때만 지워요) */
	public async handleSourcesDeleted(guildId: string, messageIds: readonly string[]): Promise<void> {
		for (const id of messageIds) this.timers.clear(id);
		if (messageIds.length === 0) return;
		try {
			const entries = await this.deps.db.starboardEntry.findMany({ where: { guildId, sourceMessageId: { in: [...messageIds] } } });
			if (entries.length === 0) return;
			await Promise.all(entries.map((entry) => this.deps.discord.remove(entry.starboardChannelId, entry.starboardMessageId)));
			await this.deps.db.starboardEntry.deleteMany({
				where: { guildId, sourceMessageId: { in: entries.map((entry) => entry.sourceMessageId) } }
			});
		} catch (error) {
			this.deps.logger.warn(`[starboard] 원문 삭제 처리 실패 (guild ${guildId}): ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	public async stop(): Promise<void> {
		this.stopped = true;
		await this.timers.stop();
		await Promise.allSettled([...this.inflight]);
	}

	private run(ref: StarboardMessageRef): Promise<void> {
		const task = this.process(ref)
			.catch((error: unknown) => {
				this.deps.logger.warn(`[starboard] 처리 실패 (guild ${ref.guildId}): ${error instanceof Error ? error.message : String(error)}`);
			})
			.finally(() => this.inflight.delete(task));
		this.inflight.add(task);
		return task;
	}

	private async process(ref: StarboardMessageRef): Promise<void> {
		if (this.running.has(ref.messageId)) {
			// 같은 원문을 처리하는 중에 다시 불렸어요 — 끝난 뒤 한 번 더 돌게 걸어요
			this.timers.set(ref.messageId, () => this.run(ref), STARBOARD_DEBOUNCE_MS);
			return;
		}
		this.running.add(ref.messageId);
		try {
			const settings = await this.getSettings(ref.guildId);
			if (!settings.channelId) return;

			const entry = await this.deps.db.starboardEntry.findUnique({ where: { sourceMessageId: ref.messageId } });
			const source = await this.deps.discord.fetchSource(ref, settings.emoji, { needAuthorStarred: settings.excludeSelf });
			// 원문이 사라졌다면 삭제 이벤트가 정리해요
			if (!source) return;
			const stars = countStars(settings, source);

			if (entry) {
				if (stars === entry.count) return;
				const result = await this.deps.discord.update(entry.starboardChannelId, entry.starboardMessageId, source, stars, settings.emoji);
				// 스타보드 글을 누군가 지웠으면('gone') 다시 올리지 않고 기록만 맞춰 둬요
				if (result !== 'failed') {
					await this.deps.db.starboardEntry.update({ where: { sourceMessageId: ref.messageId }, data: { count: stars } });
				}
				return;
			}

			if (!isStarboardEligible(settings, source, stars)) return;
			const starboardMessageId = await this.deps.discord.publish(settings.channelId, source, stars, settings.emoji);
			if (!starboardMessageId) return;
			await this.deps.db.starboardEntry.create({
				data: {
					sourceMessageId: ref.messageId,
					guildId: ref.guildId,
					sourceChannelId: ref.channelId,
					starboardChannelId: settings.channelId,
					starboardMessageId,
					count: stars
				}
			});
			this.deps.recordUsage?.(ref.guildId);
		} finally {
			this.running.delete(ref.messageId);
		}
	}
}

export function createStarboardService(deps: StarboardServiceDeps): StarboardService {
	return new StarboardService(deps);
}
