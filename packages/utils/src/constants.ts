export const BOT_NAME = '시루봇';

// 기본 색상
export const DEFAULT_COLOR = 0xffdaff;
export const OK_COLOR = 0x4299e1;
export const WARN_COLOR = 0xf56565;

type RepeatMode = 'off' | 'track' | 'queue';
export const EMOJI_REPEAT: Record<RepeatMode, string> = {
	off: '➡️',
	track: '🔁',
	queue: '🔂'
};

export const AUTOCOMPLETE_MAX_RESULT = 25;
/** 폴백용 — 사용처에서 appEmoji('sparkle', EMOJI_SPARKLE)로 감싸요 */
export const EMOJI_SPARKLE = '✨';
/** 폴백용 — volumeToEmoji에서 appEmoji와 함께 사용돼요 */
export const EMOJI_VOLUME_MUTE = '🔇';
export const EMOJI_VOLUME_SMALL = '🔉';
export const EMOJI_VOLUME_MEDIUM = '🔊';
export const EMOJI_VOLUME_LARGE = '🔊';

export const PAGE_CHUNK_SIZE = 10;

/** Emojis (Progress bars) */
export const PROGRESS_BAR_START_SINGLE_WHITE = '<:progress_start_single:965594966028079244>';
export const PROGRESS_BAR_START_WHITE = '<:progress_start_white:956493674609541140>';
export const PROGRESS_BAR_WHITE = '<:progress_bar_white:956493673913270325>';
export const PROGRESS_BAR_END_WHITE = '<:progress_end_white:956493674445934602>';
export const PROGRESS_BAR_END_MIDDLE_WHITE = '<:progress_end_middle_white:965594965650583602>';
export const PROGRESS_BAR_START_BLACK = '<:progress_start_black:956491293532520458>';
export const PROGRESS_BAR_BLACK = '<:progress_bar_black:956491293507321896>';
export const PROGRESS_BAR_END_BLACK = '<:progress_end_black:956491293448613908>';

export const PROGRESS_BAR_EMOJI_COUNT = 6;
