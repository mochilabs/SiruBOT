import type { GuildSettingsStore } from './store.ts';

/**
 * 임시 음성방(JTC) 셋팅 CRUD — 기본 채널/카테고리/마커/템플릿/인원 상한.
 * 쓰기는 store 공용 헬퍼로 캐시까지 함께 갱신해요.
 */

export async function getJtcSettings(store: GuildSettingsStore, guildId: string) {
	const guild = await store.getGuild(guildId);
	return {
		enabled: guild.jtcEnabled,
		categoryId: guild.jtcCategoryId,
		markerChannelId: guild.jtcMarkerChannelId,
		template: guild.jtcTemplate,
		userLimit: guild.jtcUserLimit
	};
}

export async function setJtcEnabled(store: GuildSettingsStore, guildId: string, enabled: boolean) {
	const guild = await store.upsertField(guildId, 'jtcEnabled', enabled);
	return guild.jtcEnabled;
}

export async function setJtcCategory(store: GuildSettingsStore, guildId: string, categoryId: string | null, markerChannelId: string | null) {
	return store.upsertData(guildId, { jtcCategoryId: categoryId, jtcMarkerChannelId: markerChannelId });
}

export async function setJtcTemplate(store: GuildSettingsStore, guildId: string, template: string) {
	const guild = await store.upsertField(guildId, 'jtcTemplate', template);
	return guild.jtcTemplate;
}

export async function setJtcUserLimit(store: GuildSettingsStore, guildId: string, userLimit: number) {
	const clamped = Math.min(99, Math.max(0, Math.floor(userLimit)));
	const guild = await store.upsertField(guildId, 'jtcUserLimit', clamped);
	return guild.jtcUserLimit;
}
