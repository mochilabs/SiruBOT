import type { Prisma } from '@sirubot/prisma';
import { normalizeCustomCommandPrefix, normalizeEmbedFixSites, normalizeEmbedFixTranslateLang } from '@sirubot/utils';
import type { GuildSettingsStore } from './store.ts';
import {
	CHAT_TOOL_TOGGLE_FIELDS,
	computeChannelToggle,
	normalizeAiMode,
	normalizeChatToolMode,
	normalizeTtsMode,
	type AiMode,
	type ChatToolName,
	type ChatToolSettings,
	type ChannelToggleSettings,
	type TtsMode,
	type TtsSettings
} from './types.ts';

/**
 * AI 채팅·채팅 TTS·채팅 유틸(이모지 확대/인용/임베드 복구)·카운팅·커맨드 접두사 정책 CRUD —
 * 채널 단위 on/off는 computeChannelToggle 공용 규칙 하나를 공유해요.
 */

export async function getAiSettings(store: GuildSettingsStore, guildId: string) {
	const guild = await store.getGuild(guildId);
	return {
		mode: normalizeAiMode(guild.aiMode),
		channelIds: guild.aiChannelIds
	};
}

/** 채팅 TTS 정책 — 잘못된 모드 값은 'off'로 폴백해요 (명시적으로 켠 길드만 낭독) */
export async function getTtsSettings(store: GuildSettingsStore, guildId: string): Promise<TtsSettings> {
	const guild = await store.getGuild(guildId);
	return {
		mode: normalizeTtsMode(guild.ttsMode),
		channelIds: guild.ttsChannelIds
	};
}

/** 커스텀 명령어 접두사 — DB에 옛/깨린 값이 있어도 안전한 기본값('!')으로 되돌려요 */
export async function getCustomCommandPrefix(store: GuildSettingsStore, guildId: string): Promise<string> {
	const guild = await store.getGuild(guildId);
	return normalizeCustomCommandPrefix(guild.customCommandPrefix);
}

/** 채팅 유틸 설정 — 모드는 'off' 폴백 정규화, 사이트 목록은 공용 계약 정규화를 거쳐요 (모르는 사이트·중복 제거, 없으면 전체 허용) */
export async function getChatToolSettings(store: GuildSettingsStore, guildId: string): Promise<ChatToolSettings> {
	const guild = await store.getGuild(guildId);
	return {
		emojiEnlarge: { mode: normalizeChatToolMode(guild.emojiEnlargeMode), channelIds: guild.emojiEnlargeChannelIds },
		quote: { mode: normalizeChatToolMode(guild.quoteMode), channelIds: guild.quoteChannelIds },
		embedFix: { mode: normalizeChatToolMode(guild.embedFixMode), channelIds: guild.embedFixChannelIds },
		embedFixSites: normalizeEmbedFixSites(guild.embedFixSites),
		embedFixSuppressOriginal: guild.embedFixSuppressOriginal,
		embedFixTranslateLang: normalizeEmbedFixTranslateLang(guild.embedFixTranslateLang),
		countingEnabled: guild.countingEnabled,
		countingChannelId: guild.countingChannelId
	};
}

export async function setAiMode(store: GuildSettingsStore, guildId: string, mode: AiMode): Promise<AiMode> {
	const guild = await store.upsertField(guildId, 'aiMode', mode);
	return normalizeAiMode(guild.aiMode);
}

/** 허용 채널 목록을 교체해요 (중복 제거) */
export async function setAiChannelIds(store: GuildSettingsStore, guildId: string, channelIds: string[]): Promise<string[]> {
	const unique = [...new Set(channelIds)];
	const guild = await store.upsertField(guildId, 'aiChannelIds', unique);
	return guild.aiChannelIds;
}

/** 삭제된 채널을 허용 목록에서 제거해요 (모드는 그대로) */
export async function removeAiChannel(store: GuildSettingsStore, guildId: string, channelId: string): Promise<void> {
	const settings = await getAiSettings(store, guildId);
	if (!settings.channelIds.includes(channelId)) return;
	await setAiChannelIds(
		store,
		guildId,
		settings.channelIds.filter((id) => id !== channelId)
	);
}

/** 특정 채널의 AI 채팅 on/off */
export async function setChannelAiEnabled(
	store: GuildSettingsStore,
	guildId: string,
	channelId: string,
	enabled: boolean,
	allTextChannelIds: string[]
): Promise<{ mode: AiMode; channelIds: string[] }> {
	const next = computeChannelToggle(await getAiSettings(store, guildId), channelId, enabled, allTextChannelIds);
	const data: Prisma.GuildUpdateInput = { aiMode: next.mode, aiChannelIds: next.channelIds };
	const guild = await store.upsertData(guildId, data);
	return { mode: normalizeAiMode(guild.aiMode), channelIds: guild.aiChannelIds };
}

/** 특정 채널의 채팅 TTS 낭독 on/off — setChannelAiEnabled와 같은 규칙이에요 */
export async function setChannelTtsEnabled(
	store: GuildSettingsStore,
	guildId: string,
	channelId: string,
	enabled: boolean,
	allTextChannelIds: string[]
): Promise<{ mode: TtsMode; channelIds: string[] }> {
	const next = computeChannelToggle(await getTtsSettings(store, guildId), channelId, enabled, allTextChannelIds);
	const data: Prisma.GuildUpdateInput = { ttsMode: next.mode, ttsChannelIds: next.channelIds };
	const guild = await store.upsertData(guildId, data);
	return { mode: normalizeTtsMode(guild.ttsMode), channelIds: guild.ttsChannelIds };
}

/** 특정 채널의 채팅 유틸 기능(이모지 확대·인용·임베드 복구) on/off — AI 채팅과 같은 토글 규칙이에요 */
export async function setChannelChatToolEnabled(
	store: GuildSettingsStore,
	guildId: string,
	tool: ChatToolName,
	channelId: string,
	enabled: boolean,
	allTextChannelIds: string[]
): Promise<ChannelToggleSettings> {
	const settings = await getChatToolSettings(store, guildId);
	const next = computeChannelToggle(settings[tool], channelId, enabled, allTextChannelIds);
	const fields = CHAT_TOOL_TOGGLE_FIELDS[tool];
	const data: Prisma.GuildUpdateInput =
		tool === 'emojiEnlarge'
			? { emojiEnlargeMode: next.mode, emojiEnlargeChannelIds: next.channelIds }
			: tool === 'quote'
				? { quoteMode: next.mode, quoteChannelIds: next.channelIds }
				: { embedFixMode: next.mode, embedFixChannelIds: next.channelIds };
	const guild = await store.upsertData(guildId, data);
	return { mode: normalizeChatToolMode(guild[fields.mode]), channelIds: guild[fields.channelIds] };
}

/** 카운팅 채널 지정 — 지정한 순간 켜져요. null을 넘기면 꺼요 */
export async function setCountingChannel(
	store: GuildSettingsStore,
	guildId: string,
	channelId: string | null
): Promise<{ countingEnabled: boolean; countingChannelId: string | null }> {
	const data: Prisma.GuildUpdateInput = { countingChannelId: channelId, countingEnabled: channelId !== null };
	const guild = await store.upsertData(guildId, data);
	return { countingEnabled: guild.countingEnabled, countingChannelId: guild.countingChannelId };
}

/** 카운팅 on/off만 바꿔요 (채널 지정은 그대로 유지) */
export async function setCountingEnabled(store: GuildSettingsStore, guildId: string, enabled: boolean): Promise<boolean> {
	const guild = await store.upsertField(guildId, 'countingEnabled', enabled);
	return guild.countingEnabled;
}
