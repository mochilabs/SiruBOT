import { container } from '@sapphire/framework';
import { Guild, Prisma } from '@sirubot/prisma';
import { MemoryCache } from '@sirubot/utils';
import { GuildMember, PermissionFlagsBits } from 'discord.js';
import { RepeatMode } from 'lavalink-client';

/** 고정 채널 입력 동작 — play: 첫 결과 즉시 재생 / select: 결과 5개 중 선택 */
export type PinnedChannelMode = 'play' | 'select';

export class GuildService {
	// Guild settings cache (60s TTL, max 500)
	private cache = new MemoryCache<string, Guild>({ ttl: 60_000, maxSize: 500 });

	/**
	 * Get guild settings. If cached, return from cache, otherwise upsert from DB.
	 */
	public async getGuild(guildId: string): Promise<Guild> {
		const cached = this.cache.get(guildId);
		if (cached) return cached;

		const guild = await container.db.guild.upsert({
			where: { id: guildId },
			create: { id: guildId },
			update: {}
		});

		this.cache.set(guildId, guild);
		return guild;
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

	// ── AI 채팅 설정 ────────────────────────────────────────────────

	public async getAiSettings(guildId: string) {
		const guild = await this.getGuild(guildId);
		return {
			enabled: guild.aiEnabled,
			model: guild.aiModel,
			systemPrompt: guild.aiSystemPrompt,
			disabledChannelIds: guild.aiDisabledChannelIds
		};
	}

	public async setAiEnabled(guildId: string, enabled: boolean): Promise<boolean> {
		const guild = await this.upsertField(guildId, 'aiEnabled', enabled);
		return guild.aiEnabled;
	}

	/** null이면 env 기본 모델로 되돌려요 */
	public async setAiModel(guildId: string, model: string | null): Promise<string | null> {
		const guild = await this.upsertField(guildId, 'aiModel', model);
		return guild.aiModel;
	}

	/** null이면 고정 프롬프트를 제거해요 */
	public async setAiSystemPrompt(guildId: string, prompt: string | null): Promise<string | null> {
		const guild = await this.upsertField(guildId, 'aiSystemPrompt', prompt);
		return guild.aiSystemPrompt;
	}

	/** 현재 채널의 AI 채팅 on/off — false면 aiDisabledChannelIds에 추가 */
	public async setChannelAiEnabled(guildId: string, channelId: string, enabled: boolean): Promise<string[]> {
		const guild = await this.getGuild(guildId);
		const disabled = new Set(guild.aiDisabledChannelIds);
		if (enabled) disabled.delete(channelId);
		else disabled.add(channelId);
		const updated = await this.upsertField(guildId, 'aiDisabledChannelIds', [...disabled]);
		return updated.aiDisabledChannelIds;
	}
}

export interface MixerSettings {
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
}
