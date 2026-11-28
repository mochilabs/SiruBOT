import type { ChatToolMode, EmbedFixSite, EmbedFixTranslateLang } from '@sirubot/utils';

export { normalizeChatToolMode, type ChatToolMode } from '@sirubot/utils';

export {
	normalizeAiMode,
	normalizeTextChannelMode,
	type AiMode,
	type TextChannelModeSetting as TextChannelMode
} from '@sirubot/utils/guildSettingsContract';

export type TtsMode = 'all' | 'channels' | 'off';

const TTS_MODES: readonly string[] = ['all', 'channels', 'off'];

export function normalizeTtsMode(value: string): TtsMode {
	return TTS_MODES.includes(value) ? (value as TtsMode) : 'off';
}

export interface TtsSettings {
	mode: TtsMode;
	channelIds: string[];
}

export function isChannelToggleEnabled(settings: { mode: 'all' | 'channels' | 'off'; channelIds: string[] }, channelId: string): boolean {
	if (settings.mode === 'off') return false;
	if (settings.mode === 'all') return true;
	return settings.channelIds.includes(channelId);
}

export function computeChannelToggle<TMode extends 'all' | 'channels' | 'off'>(
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

export interface ChannelToggleSettings {
	mode: ChatToolMode;
	channelIds: string[];
}

export interface ChatToolSettings {
	emojiEnlarge: ChannelToggleSettings;
	quote: ChannelToggleSettings;
	embedFix: ChannelToggleSettings;
	embedFixSites: EmbedFixSite[];
	embedFixSuppressOriginal: boolean;
	embedFixTranslateLang: EmbedFixTranslateLang;
	countingEnabled: boolean;
	countingChannelId: string | null;
}

export const CHAT_TOOL_TOGGLE_FIELDS = {
	emojiEnlarge: { mode: 'emojiEnlargeMode', channelIds: 'emojiEnlargeChannelIds' },
	quote: { mode: 'quoteMode', channelIds: 'quoteChannelIds' },
	embedFix: { mode: 'embedFixMode', channelIds: 'embedFixChannelIds' }
} as const;

export type ChatToolName = keyof typeof CHAT_TOOL_TOGGLE_FIELDS;

export interface MixerSettings {
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
	normalizationEnabled: boolean;
	automixEnabled: boolean;
	automixMaxTempoChange: number;
	automixMinConfidence: number;
}
