export const BOT_NAME = '시루봇';

export const VOICE_CHANNEL_REQUIRED_MESSAGE = '먼저 음성 채널에 접속해 주세요.';

// Must match render-emojis.mjs accent color.
export const DEFAULT_COLOR = 0xff85c0;
export const WARN_COLOR = 0xf56565;

export const PROGRESS_BAR_EMOJI_NAMES = {
	start_empty: 'pb_start_empty',
	start_half: 'pb_start_half',
	start_filled: 'pb_start_filled',
	mid_empty: 'pb_mid_empty',
	mid_half: 'pb_mid_half',
	mid_filled: 'pb_mid_filled',
	mid_end_empty: 'pb_mid_end_empty',
	mid_end_half: 'pb_mid_end_half',
	mid_end_filled: 'pb_mid_end_filled',
	end_empty: 'pb_end_empty',
	end_half: 'pb_end_half',
	end_filled: 'pb_end_filled'
} as const;

export const PROGRESS_BAR_EMOJI_COUNT = 5;
export const PROGRESS_BAR_STEPS_PER_CELL = 2;
