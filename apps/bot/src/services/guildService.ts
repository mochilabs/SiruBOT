import { container } from '@sapphire/framework';
import { Guild, Prisma } from '@sirubot/prisma';
import { MemoryCache, normalizeCustomCommandPrefix, normalizeEmbedFixSites, type EmbedFixSite } from '@sirubot/utils';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { RepeatMode } from 'lavalink-client';

/** 고정 채널 입력 동작 — play: 첫 결과 즉시 재생 / select: 결과 5개 중 선택 */
export type PinnedChannelMode = 'play' | 'select';

/** AI 채팅 모드 — all: 모든 채널 / channels: 특정 채널만 / off: 끄기 */
export type AiMode = 'all' | 'channels' | 'off';

const AI_MODES: readonly string[] = ['all', 'channels', 'off'];

/** DB에 잘못된 값이 들어와도 안전하게 기본값으로 되돌려요 */
export function normalizeAiMode(value: string): AiMode {
	return AI_MODES.includes(value) ? (value as AiMode) : 'all';
}

/** 채팅 TTS 모드 — all: 모든 채널 / channels: 특정 채널만 / off: 끄기(기본). TTS는 명시적으로 켜야 해요 */
export type TtsMode = 'all' | 'channels' | 'off';

const TTS_MODES: readonly string[] = ['all', 'channels', 'off'];

/** DB에 잘못된 값이 들어와도 안전하게 기본값('off')으로 되돌려요 */
export function normalizeTtsMode(value: string): TtsMode {
	return TTS_MODES.includes(value) ? (value as TtsMode) : 'off';
}

export interface TtsSettings {
	mode: TtsMode;
	channelIds: string[];
}

/** 이 채널의 메시지를 낭독 대상인지 — 리스너는 조용히 건너뛰므로 boolean만 돌려줘요 */
export function isTtsEnabled(settings: TtsSettings, channelId: string): boolean {
	if (settings.mode === 'off') return false;
	if (settings.mode === 'all') return true;
	return settings.channelIds.includes(channelId);
}

/** 채팅 유틸 설정 — 대시보드에서 켜고 끄는 이모지 확대·메시지 인용·임베드 복구·카운팅이에요 */
export interface ChatToolSettings {
	emojiEnlargeEnabled: boolean;
	quoteEnabled: boolean;
	embedFixEnabled: boolean;
	embedFixSites: EmbedFixSite[];
	embedFixSuppressOriginal: boolean;
	countingEnabled: boolean;
	countingChannelId: string | null;
}

export class GuildService {
	// Guild settings cache (60s TTL, max 500)
	private cache = new MemoryCache<string, Guild>({ ttl: 60_000, maxSize: 500 });
	private readonly pendingReads = new Map<string, Promise<Guild>>();
	/** 길드별 무효화 세대 — 무효화 1회마다 1씩 증가해요 (단조 증가, 삭제하지 않아요) */
	private readonly invalidationGeneration = new Map<string, number>();

	/**
	 * Get guild settings. If cached, return from cache, otherwise upsert from DB.
	 */
	public async getGuild(guildId: string): Promise<Guild> {
		const cached = this.cache.get(guildId);
		if (cached) return cached;

		const existing = this.pendingReads.get(guildId);
		if (existing) return existing;

		const pending = this.loadGuild(guildId);
		this.pendingReads.set(guildId, pending);
		try {
			return await pending;
		} finally {
			if (this.pendingReads.get(guildId) === pending) this.pendingReads.delete(guildId);
		}
	}

	private async loadGuild(guildId: string): Promise<Guild> {
		/** DB 조회 시작 시점의 무효화 세대 — 완료 시점과 비교해 stale 재심기를 막아요 */
		const myGeneration = this.invalidationGeneration.get(guildId) ?? 0;
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});

		// 조회 중 setter가 갱신한 설정을 오래된 조회 결과로 덮어쓰지 않는다.
		const updated = this.cache.get(guildId);
		if (updated) return updated;

		// 조회 중 무효화가 일어나 세대가 올라갔으면 이 결과는 무효화 이전 read-시점 값 —
		// 캐시에 심지 않고 호출자에게만 돌려요 (다음 조회는 DB에서 최신을 읽어요).
		if ((this.invalidationGeneration.get(guildId) ?? 0) !== myGeneration) return guild;

		// 세대가 그대로면 이 조회는 최신 무효화 이후의 DB read라 fresh — 캐시에 심어요.
		this.updateCache(guild);
		return guild;
	}

	/**
	 * 캐시에서 특정 길드 설정을 비워요 — 대시보드 저장을 Redis Pub/Sub으로 전파받으면 호출해요.
	 *
	 * pendingReads 경쟁 처리: 무효화 때 세대를 1 올려 둬서, 무효화 "이전"에 DB read를 시작해
	 * "이후"에 끝나는 in-flight 조회(loadGuild)가 stale 값을 캐시에 다시 심지 않게 해요.
	 * 그런 조회는 세대 불일치로 감지되어 캐시 미스로 남겨 다음 조회가 DB에서 다시 읽어요.
	 */
	public invalidate(guildId: string): void {
		this.cache.delete(guildId);
		this.invalidationGeneration.set(guildId, (this.invalidationGeneration.get(guildId) ?? 0) + 1);
	}

	/** Update cache with fresh data (used when setter is called) */
	private updateCache(guild: Guild) {
		this.cache.set(guild.id, guild);
	}

	private async upsertField<K extends keyof Omit<Guild, 'id'>>(guildId: string, field: K, value: Guild[K]): Promise<Guild> {
		const data = { [field]: value } as Prisma.GuildUpdateInput;
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, ...data } as Prisma.GuildCreateInput,
			update: data
		});

		this.updateCache(guild);
		return guild;
	}

	public async updateVolume(guildId: string, volume: number) {
		const guild = await this.upsertField(guildId, 'volume', volume);
		return guild;
	}

	public async getVolume(guildId: string) {
		const guild = await this.getGuild(guildId);
		return guild.volume;
	}

	public async getDJRole(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.djRoleId;
	}

	public async setDJRole(guildId: string, djRoleId: string | null) {
		const guild = await this.upsertField(guildId, 'djRoleId', djRoleId);
		return guild;
	}

	public async hasDJRole(guildId: string, member: GuildMember) {
		const djRoleId = await this.getDJRole(guildId);
		if (djRoleId === null || member.permissions.has(PermissionFlagsBits.Administrator)) return true;
		return member.roles.cache.has(djRoleId);
	}

	public async getRepeat(guildId: string): Promise<RepeatMode> {
		const guild = await this.getGuild(guildId);
		return guild.repeat as RepeatMode;
	}

	public async setRepeat(guildId: string, repeat: RepeatMode): Promise<RepeatMode> {
		if (repeat !== 'off' && repeat !== 'track' && repeat !== 'queue') throw new Error('Invalid repeat value');
		const guild = await this.upsertField(guildId, 'repeat', repeat);
		return guild.repeat as RepeatMode;
	}

	public async getRelated(guildId: string): Promise<boolean> {
		const guild = await this.getGuild(guildId);
		return guild.related;
	}

	public async setRelated(guildId: string, related: boolean): Promise<boolean> {
		const guild = await this.upsertField(guildId, 'related', related);
		return guild.related;
	}

	public async setDefaultTextChannel(guildId: string, textChannelId: string | null) {
		const guild = await this.upsertField(guildId, 'textChannelId', textChannelId);
		return guild.textChannelId;
	}

	public async getDefaultTextChannel(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.textChannelId;
	}

	public async setDefaultVoiceChannel(guildId: string, voiceChannelId: string | null) {
		const guild = await this.upsertField(guildId, 'voiceChannelId', voiceChannelId);
		return guild.voiceChannelId;
	}

	public async getDefaultVoiceChannel(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.voiceChannelId;
	}

	public async getPinnedChannel(guildId: string): Promise<string | null> {
		const guild = await this.getGuild(guildId);
		return guild.pinnedChannelId;
	}

	public async setPinnedChannel(guildId: string, channelId: string | null) {
		const guild = await this.upsertField(guildId, 'pinnedChannelId', channelId);
		return guild.pinnedChannelId;
	}

	public async getPinnedChannelMode(guildId: string): Promise<PinnedChannelMode> {
		const guild = await this.getGuild(guildId);
		return guild.pinnedChannelMode === 'select' ? 'select' : 'play';
	}

	public async setPinnedChannelMode(guildId: string, mode: PinnedChannelMode) {
		const guild = await this.upsertField(guildId, 'pinnedChannelMode', mode);
		return guild.pinnedChannelMode as PinnedChannelMode;
	}

	/** 고정 채널 입력 메시지 삭제 여부 — 봇 처리 후 사용자 메시지를 지운다 (Manage Messages 권한 필요) */
	public async getPinnedChannelDeleteInput(guildId: string): Promise<boolean> {
		const guild = await this.getGuild(guildId);
		return guild.pinnedChannelDeleteInput;
	}

	public async setPinnedChannelDeleteInput(guildId: string, deleteInput: boolean) {
		const guild = await this.upsertField(guildId, 'pinnedChannelDeleteInput', deleteInput);
		return guild.pinnedChannelDeleteInput;
	}

	public async getJtcSettings(guildId: string) {
		const guild = await this.getGuild(guildId);
		return {
			enabled: guild.jtcEnabled,
			categoryId: guild.jtcCategoryId,
			markerChannelId: guild.jtcMarkerChannelId,
			template: guild.jtcTemplate,
			userLimit: guild.jtcUserLimit
		};
	}

	public async setJtcEnabled(guildId: string, enabled: boolean) {
		const guild = await this.upsertField(guildId, 'jtcEnabled', enabled);
		return guild.jtcEnabled;
	}

	public async setJtcCategory(guildId: string, categoryId: string | null, markerChannelId: string | null) {
		const updated = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, jtcCategoryId: categoryId, jtcMarkerChannelId: markerChannelId },
			update: { jtcCategoryId: categoryId, jtcMarkerChannelId: markerChannelId }
		});
		this.updateCache(updated);
		return updated;
	}

	public async setJtcTemplate(guildId: string, template: string) {
		const guild = await this.upsertField(guildId, 'jtcTemplate', template);
		return guild.jtcTemplate;
	}

	public async setJtcUserLimit(guildId: string, userLimit: number) {
		const clamped = Math.min(99, Math.max(0, Math.floor(userLimit)));
		const guild = await this.upsertField(guildId, 'jtcUserLimit', clamped);
		return guild.jtcUserLimit;
	}

	public async getEnableController(guildId: string): Promise<boolean> {
		const guild = await this.getGuild(guildId);
		return guild.enableController;
	}

	public async setEnableController(guildId: string, enableController: boolean) {
		const guild = await this.upsertField(guildId, 'enableController', enableController);
		return guild.enableController;
	}

	public async getMixerSettings(guildId: string): Promise<MixerSettings> {
		const guild = await this.getGuild(guildId);
		return {
			gaplessEnabled: guild.gaplessEnabled,
			crossfadeEnabled: guild.crossfadeEnabled,
			crossfadeMs: guild.crossfadeMs
		};
	}

	public async setGapless(guildId: string, enabled: boolean) {
		const guild = await this.upsertField(guildId, 'gaplessEnabled', enabled);
		return guild.gaplessEnabled;
	}

	public async setCrossfade(guildId: string, enabled: boolean, durationMs?: number) {
		// Lavalink mixer 플러그인의 겹치기 상한은 15초(15000ms)라 여기서 잘라요
		const clamped = durationMs === undefined ? undefined : Math.round(Math.min(15000, Math.max(500, durationMs)));
		const guild = await this.getGuild(guildId);
		const data: Prisma.GuildUpdateInput = { crossfadeEnabled: enabled };
		if (clamped !== undefined) data.crossfadeMs = clamped;
		const updated = await container.db.guild.update({ where: { id: guild.id }, data });
		this.updateCache(updated);
		return { crossfadeEnabled: updated.crossfadeEnabled, crossfadeMs: updated.crossfadeMs };
	}

	/** SponsorBlock 카테고리 목록 — playerHandler가 세그먼트를 다시 계산할 때 즉시 최신 값을 읽도록 캐시도 함께 갱신해요. */
	public async setSponsorBlockSegments(guildId: string, segments: string[]): Promise<string[]> {
		const guild = await this.upsertField(guildId, 'sponsorBlockSegments', segments);
		return guild.sponsorBlockSegments;
	}

	public async getAiSettings(guildId: string) {
		const guild = await this.getGuild(guildId);
		return {
			mode: normalizeAiMode(guild.aiMode),
			channelIds: guild.aiChannelIds
		};
	}

	/** 채팅 TTS 정책 — 잘못된 모드 값은 'off'로 폴백해요 (명시적으로 켠 길드만 낭독) */
	public async getTtsSettings(guildId: string): Promise<TtsSettings> {
		const guild = await this.getGuild(guildId);
		return {
			mode: normalizeTtsMode(guild.ttsMode),
			channelIds: guild.ttsChannelIds
		};
	}

	/** 커스텀 명령어 접두사 — DB에 옛/깨린 값이 있어도 안전한 기본값('!')으로 되돌려요 */
	public async getCustomCommandPrefix(guildId: string): Promise<string> {
		const guild = await this.getGuild(guildId);
		return normalizeCustomCommandPrefix(guild.customCommandPrefix);
	}

	/** 채팅 유틸 설정 — 사이트 목록은 공용 계약 정규화를 거쳐요 (모르는 사이트·중복 제거, 없으면 전체 허용) */
	public async getChatToolSettings(guildId: string): Promise<ChatToolSettings> {
		const guild = await this.getGuild(guildId);
		return {
			emojiEnlargeEnabled: guild.emojiEnlargeEnabled,
			quoteEnabled: guild.quoteEnabled,
			embedFixEnabled: guild.embedFixEnabled,
			embedFixSites: normalizeEmbedFixSites(guild.embedFixSites),
			embedFixSuppressOriginal: guild.embedFixSuppressOriginal,
			countingEnabled: guild.countingEnabled,
			countingChannelId: guild.countingChannelId
		};
	}

	public async setAiMode(guildId: string, mode: AiMode): Promise<AiMode> {
		const guild = await this.upsertField(guildId, 'aiMode', mode);
		return normalizeAiMode(guild.aiMode);
	}

	/** 허용 채널 목록을 교체해요 (중복 제거) */
	public async setAiChannelIds(guildId: string, channelIds: string[]): Promise<string[]> {
		const unique = [...new Set(channelIds)];
		const guild = await this.upsertField(guildId, 'aiChannelIds', unique);
		return guild.aiChannelIds;
	}

	/** 삭제된 채널을 허용 목록에서 제거해요 (모드는 그대로) */
	public async removeAiChannel(guildId: string, channelId: string): Promise<void> {
		const settings = await this.getAiSettings(guildId);
		if (!settings.channelIds.includes(channelId)) return;
		await this.setAiChannelIds(
			guildId,
			settings.channelIds.filter((id) => id !== channelId)
		);
	}

	/**
	 * 채널 단위 on/off에서 모드·허용 목록이 어떻게 바뀌는지 계산해요 — AI 채팅과
	 * 채팅 TTS가 같은 규칙을 써요.
	 * - 켜기: off면 channels + [해당 채널], channels면 목록에 추가 (all은 이미 켜져 있어요)
	 * - 끄기: channels면 목록에서 제거(비면 off), all이면 나머지 텍스트 채널을 목록으로 승계
	 */
	private computeChannelToggle<TMode extends 'all' | 'channels' | 'off'>(
		settings: { mode: TMode; channelIds: string[] },
		channelId: string,
		enabled: boolean,
		allTextChannelIds: string[]
	): { mode: TMode; channelIds: string[] } {
		let mode = settings.mode;
		let channelIds = settings.channelIds;

		if (enabled) {
			if (mode === 'all') return { mode, channelIds };
			const base = mode === 'off' ? [] : channelIds;
			channelIds = [...new Set([...base, channelId])];
			mode = 'channels' as TMode;
		} else {
			if (mode === 'off') return { mode, channelIds };
			if (mode === 'all') {
				channelIds = allTextChannelIds.filter((id) => id !== channelId);
				mode = (channelIds.length > 0 ? 'channels' : 'off') as TMode;
			} else {
				channelIds = channelIds.filter((id) => id !== channelId);
				if (channelIds.length === 0) mode = 'off' as TMode;
			}
		}
		return { mode, channelIds };
	}

	/** 특정 채널의 AI 채팅 on/off */
	public async setChannelAiEnabled(
		guildId: string,
		channelId: string,
		enabled: boolean,
		allTextChannelIds: string[]
	): Promise<{ mode: AiMode; channelIds: string[] }> {
		const next = this.computeChannelToggle(await this.getAiSettings(guildId), channelId, enabled, allTextChannelIds);
		const data: Prisma.GuildUpdateInput = { aiMode: next.mode, aiChannelIds: next.channelIds };
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, ...data } as Prisma.GuildCreateInput,
			update: data
		});
		this.updateCache(guild);
		return { mode: normalizeAiMode(guild.aiMode), channelIds: guild.aiChannelIds };
	}

	/** 특정 채널의 채팅 TTS 낭독 on/off — setChannelAiEnabled와 같은 규칙이에요 */
	public async setChannelTtsEnabled(
		guildId: string,
		channelId: string,
		enabled: boolean,
		allTextChannelIds: string[]
	): Promise<{ mode: TtsMode; channelIds: string[] }> {
		const next = this.computeChannelToggle(await this.getTtsSettings(guildId), channelId, enabled, allTextChannelIds);
		const data: Prisma.GuildUpdateInput = { ttsMode: next.mode, ttsChannelIds: next.channelIds };
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, ...data } as Prisma.GuildCreateInput,
			update: data
		});
		this.updateCache(guild);
		return { mode: normalizeTtsMode(guild.ttsMode), channelIds: guild.ttsChannelIds };
	}
}

export interface MixerSettings {
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
}
