import type { EmbedFixSite } from '@sirubot/utils';

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
	return isChannelToggleEnabled(settings, channelId);
}

/** 채널 토글 공용 규칙 — off면 끄기, all이면 항상 켜기, channels면 허용 목록에 있는 채널만 켜기 */
export function isChannelToggleEnabled(settings: { mode: 'all' | 'channels' | 'off'; channelIds: string[] }, channelId: string): boolean {
	if (settings.mode === 'off') return false;
	if (settings.mode === 'all') return true;
	return settings.channelIds.includes(channelId);
}

/**
 * 채널 단위 on/off에서 모드·허용 목록이 어떻게 바뀌는지 계산해요 — AI 채팅과
 * 채팅 TTS가 같은 규칙을 써요.
 * - 켜기: off면 channels + [해당 채널], channels면 목록에 추가 (all은 이미 켜져 있어요)
 * - 끄기: channels면 목록에서 제거(비면 off), all이면 나머지 텍스트 채널을 목록으로 승계
 */
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

/** 채팅 유틸 모드 — all: 모든 채널 / channels: 특정 채널만 / off: 끄기(기본). 채팅 유틸은 명시적으로 켜야 해요 */
export type ChatToolMode = 'all' | 'channels' | 'off';

const CHAT_TOOL_MODES: readonly string[] = ['all', 'channels', 'off'];

/** DB에 잘못된 값이 들어와도 안전하게 기본값('off')으로 되돌려요 */
export function normalizeChatToolMode(value: string): ChatToolMode {
	return CHAT_TOOL_MODES.includes(value) ? (value as ChatToolMode) : 'off';
}

/** 채널 토글 설정 — 이모지 확대·메시지 인용·임베드 복구가 같은 모양을 공유해요 */
export interface ChannelToggleSettings {
	mode: ChatToolMode;
	channelIds: string[];
}

/** 채팅 유틸 설정 — 대시보드·명령어에서 켜고 끄는 이모지 확대·메시지 인용·임베드 복구·카운팅이에요 */
export interface ChatToolSettings {
	emojiEnlarge: ChannelToggleSettings;
	quote: ChannelToggleSettings;
	embedFix: ChannelToggleSettings;
	embedFixSites: EmbedFixSite[];
	embedFixSuppressOriginal: boolean;
	countingEnabled: boolean;
	countingChannelId: string | null;
}

/** 채팅 유틸 채널 토글이 매핑되는 DB 필드 — 세 기능이 같은 규칙을 공유해요 */
export const CHAT_TOOL_TOGGLE_FIELDS = {
	emojiEnlarge: { mode: 'emojiEnlargeMode', channelIds: 'emojiEnlargeChannelIds' },
	quote: { mode: 'quoteMode', channelIds: 'quoteChannelIds' },
	embedFix: { mode: 'embedFixMode', channelIds: 'embedFixChannelIds' }
} as const;

/** 채팅 유틸 기능 키 — 명령어·서비스가 채널 토글을 지정할 때 써요 */
export type ChatToolName = keyof typeof CHAT_TOOL_TOGGLE_FIELDS;

export interface MixerSettings {
	gaplessEnabled: boolean;
	crossfadeEnabled: boolean;
	crossfadeMs: number;
}
