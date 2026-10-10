import { container } from '@sapphire/framework';
import { Guild, Prisma } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';
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
		const clamped = durationMs === undefined ? undefined : Math.round(Math.min(30000, Math.max(500, durationMs)));
		const guild = await this.getGuild(guildId);
		const data: Prisma.GuildUpdateInput = { crossfadeEnabled: enabled };
		if (clamped !== undefined) data.crossfadeMs = clamped;
		const updated = await container.db.guild.update({ where: { id: guild.id }, data });
		this.updateCache(updated);
		return { crossfadeEnabled: updated.crossfadeEnabled, crossfadeMs: updated.crossfadeMs };
	}

	public async getAiSettings(guildId: string) {
		const guild = await this.getGuild(guildId);
		return {
			mode: normalizeAiMode(guild.aiMode),
			channelIds: guild.aiChannelIds
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
	 * 특정 채널의 AI 채팅 on/off — 모드와 허용 목록을 함께 계산해요.
	 * - 켜기: off면 channels + [해당 채널], channels면 목록에 추가 (all은 이미 켜져 있어요)
	 * - 끄기: channels면 목록에서 제거(비면 off), all이면 나머지 텍스트 채널을 목록으로 승계
	 */
	public async setChannelAiEnabled(
		guildId: string,
		channelId: string,
		enabled: boolean,
		allTextChannelIds: string[]
	): Promise<{ mode: AiMode; channelIds: string[] }> {
		const settings = await this.getAiSettings(guildId);
		let mode = settings.mode;
		let channelIds = settings.channelIds;

		if (enabled) {
			if (mode === 'all') return { mode, channelIds };
			const base = mode === 'off' ? [] : channelIds;
			channelIds = [...new Set([...base, channelId])];
			mode = 'channels';
		} else {
			if (mode === 'off') return { mode, channelIds };
			if (mode === 'all') {
				channelIds = allTextChannelIds.filter((id) => id !== channelId);
				mode = channelIds.length > 0 ? 'channels' : 'off';
			} else {
				channelIds = channelIds.filter((id) => id !== channelId);
				if (channelIds.length === 0) mode = 'off';
			}
		}

		const data: Prisma.GuildUpdateInput = { aiMode: mode, aiChannelIds: channelIds };
		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId, ...data } as Prisma.GuildCreateInput,
			update: data
		});
		this.updateCache(guild);
		return { mode: normalizeAiMode(guild.aiMode), channelIds: guild.aiChannelIds };
	}
}

export interface MixerSettings {
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
}
