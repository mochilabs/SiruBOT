import { PROGRESS_BAR_EMOJI_COUNT, PROGRESS_BAR_EMOJI_NAMES, PROGRESS_BAR_STEPS_PER_CELL } from './constants.js';
import type { Track } from 'lavalink-client';
import { emoji } from './appEmoji.js';
import { formatTime, formatTimeToKorean } from './time.js';

const EMOJI_KEYCAP_REGEX = /[\u0023-\u0039]\ufe0f?\u20e3/g;
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const EMOJI_COMPONENT_REGEX = /\p{Emoji_Component}/gu;
const DIGIT_SYMBOL_REGEX = /[\d*#]/;

export function emojiProgressBar(percent: number): string {
	if (Number.isNaN(percent)) percent = 0;
	const clamped = Math.min(1, Math.max(0, percent));

	const EMPTY = '□';
	const HALF = '◐';
	const FILL = '■';

	const steps = PROGRESS_BAR_EMOJI_COUNT * PROGRESS_BAR_STEPS_PER_CELL;
	const s = Math.round(clamped * steps);
	const stateOf = (i: number): 'filled' | 'half' | 'empty' => {
		const cellSteps = s - i * PROGRESS_BAR_STEPS_PER_CELL;
		if (cellSteps >= PROGRESS_BAR_STEPS_PER_CELL) return 'filled';
		if (cellSteps === PROGRESS_BAR_STEPS_PER_CELL - 1) return 'half';
		return 'empty';
	};

	const parts: string[] = [];
	for (let i = 0; i < PROGRESS_BAR_EMOJI_COUNT; i++) {
		const state = stateOf(i);
		const isMidEnd =
			state !== 'empty' &&
			i > 0 &&
			i < PROGRESS_BAR_EMOJI_COUNT - 1 &&
			Array.from({ length: PROGRESS_BAR_EMOJI_COUNT - 1 - i }, (_, k) => stateOf(i + 1 + k)).every((x) => x === 'empty');
		const kind = i === 0 ? 'start' : i === PROGRESS_BAR_EMOJI_COUNT - 1 ? 'end' : isMidEnd ? 'mid_end' : 'mid';
		const fallback = state === 'filled' ? FILL : state === 'half' ? HALF : EMPTY;
		parts.push(emoji(PROGRESS_BAR_EMOJI_NAMES[`${kind}_${state}` as keyof typeof PROGRESS_BAR_EMOJI_NAMES], fallback));
	}
	return parts.join('');
}

export function removeEmojis(str: string): string {
	if (!str) return str;

	EMOJI_KEYCAP_REGEX.lastIndex = 0;
	EMOJI_REGEX.lastIndex = 0;
	EMOJI_COMPONENT_REGEX.lastIndex = 0;

	let result = str;

	result = result.replace(EMOJI_KEYCAP_REGEX, '');
	result = result.replace(EMOJI_REGEX, '');
	const emojiComponents = result.match(EMOJI_COMPONENT_REGEX);
	if (emojiComponents) {
		for (const component of emojiComponents) {
			if (!DIGIT_SYMBOL_REGEX.test(component)) {
				result = result.replace(component, '');
			}
		}
	}

	return result.trim();
}

export function volumeToEmoji(volume: number): string {
	if (volume < 1) {
		return emoji('volume_muted');
	} else if (volume < 33) {
		return emoji('volume_down');
	} else {
		return emoji('volume_up');
	}
}

type FormatTrackOptions = {
	showLength?: boolean;
	withMarkdownURL?: boolean;
	timeType?: 'seconds' | 'korean';
	cleanTitle?: boolean;
	titleLength?: {
		maxLength: number;
		mask?: string;
	};
};

const MAX_TRACK_URL_LENGTH = 70;
export function formatTrack(track: Track, options?: FormatTrackOptions): string {
	const { title = '(제목 없음)', duration, isStream } = track.info;
	const { showLength, withMarkdownURL, streamString, timeType, cleanTitle, titleLength } = {
		showLength: true,
		streamString: 'LIVE',
		withMarkdownURL: false,
		timeType: 'seconds',
		cleanTitle: false,
		...options
	};

	// Discord breaks markdown links if the label contains emojis.
	let formattedTitle = cleanTitle || withMarkdownURL ? removeEmojis(title.trim()) : title.trim();

	if (titleLength && formattedTitle.length > titleLength.maxLength) {
		const mask = titleLength.mask ?? '...';
		formattedTitle = formattedTitle.substring(0, titleLength.maxLength - mask.length) + mask;
	}

	let lengthStr = '';
	if (showLength) {
		if (duration) {
			if (isStream) {
				lengthStr = ` [${streamString}]`;
			} else {
				const formattedTime = timeType === 'seconds' ? formatTime(duration / 1000) : formatTimeToKorean(duration / 1000);
				lengthStr = ` [${formattedTime}]`;
			}
		} else {
			lengthStr = ' [N/A]';
		}
	}

	const hasValidUrl = track.info.uri && track.info.uri.length <= MAX_TRACK_URL_LENGTH;

	if (withMarkdownURL) {
		if (hasValidUrl) {
			return `[${formattedTitle}${lengthStr}](${track.info.uri})`;
		}
		return `${formattedTitle}${lengthStr}`;
	}

	return `${formattedTitle}${lengthStr}`;
}
