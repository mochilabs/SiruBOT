import { PROGRESS_BAR_EMOJI_COUNT, PROGRESS_BAR_EMOJI_NAMES, PROGRESS_BAR_STEPS_PER_CELL } from './constants.js';
import type { Track } from 'lavalink-client';
import { emoji } from './appEmoji.js';
import { formatTime, formatTimeToKorean } from './time.js';

const EMOJI_KEYCAP_REGEX = /[\u0023-\u0039]\ufe0f?\u20e3/g;
const EMOJI_REGEX = /\p{Extended_Pictographic}/gu;
const EMOJI_COMPONENT_REGEX = /\p{Emoji_Component}/gu;
const DIGIT_SYMBOL_REGEX = /[\d*#]/;

/**
 * 앱 이모지 진행바 — 6셀(start + mid×4 + end), 셀당 filled/half/empty.
 * 셀 png는 resources/emoji_replacement/pb_*.png (upload-emojis로 앱 이모지 등록).
 * 매핑이 아직 없으면 셀이 유니코드 폴백('■'/'◐'/'□')으로 나와요.
 */
export function emojiProgressBar(percent: number): string {
	if (Number.isNaN(percent)) percent = 0;
	const clamped = Math.min(1, Math.max(0, percent));

	const FILL_FALLBACK = '■';
	const HALF_FALLBACK = '◐';
	const EMPTY_FALLBACK = '□';
	const cell = (name: string, state: 'filled' | 'half' | 'empty') =>
		emoji(name, state === 'filled' ? FILL_FALLBACK : state === 'half' ? HALF_FALLBACK : EMPTY_FALLBACK);

	// 전체 스텝 = 셀 수 × 셀당 스텝. 스텝 s가 속한 셀의 채움 상태로 변환해요.
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
		const kind = i === 0 ? 'start' : i === PROGRESS_BAR_EMOJI_COUNT - 1 ? 'end' : 'mid';
		parts.push(cell(PROGRESS_BAR_EMOJI_NAMES[`${kind}_${stateOf(i)}` as keyof typeof PROGRESS_BAR_EMOJI_NAMES], stateOf(i)));
	}
	return parts.join('');
}

export function getRequesterText(track: Track): string {
	// controller.ts와 동일한 가드: requester가 없거나 문자열이면 .id 접근으로 터지지 않도록 한다.
	const requester = track.requester;
	const requesterId = requester && typeof requester === 'object' ? (requester as { id?: unknown }).id : requester;
	if (requesterId === 'related_track') return `추천 곡 ${emoji('sparkle')}`;
	if (typeof requesterId === 'string' && requesterId.length > 0) return `신청자: <@${requesterId}>`;
	return '';
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
		return emoji('volume_up');
	} else if (volume < 66) {
		return emoji('volume_up');
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
	const { title = 'Unknown Title', duration, isStream } = track.info;
	const { showLength, withMarkdownURL, streamString, timeType, cleanTitle, titleLength } = {
		showLength: true,
		streamString: 'LIVE',
		withMarkdownURL: false,
		timeType: 'seconds',
		cleanTitle: false,
		...options
	};

	let formattedTitle = cleanTitle ? removeEmojis(title.trim()) : title.trim();

	// Truncate title if titleLength option is provided
	if (titleLength && formattedTitle.length > titleLength.maxLength) {
		const mask = titleLength.mask ?? '...';
		formattedTitle = formattedTitle.substring(0, titleLength.maxLength - mask.length) + mask;
	}

	// Calculate length string
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

	// Construct final string with/without markdown URL
	const hasValidUrl = track.info.uri && track.info.uri.length <= MAX_TRACK_URL_LENGTH;

	if (withMarkdownURL) {
		if (hasValidUrl) {
			return `[${formattedTitle}${lengthStr}](${track.info.uri})`;
		} else {
			// fallback without link if url is too long or missing
			return `${formattedTitle}${lengthStr}`;
		}
	}

	return `${formattedTitle}${lengthStr}`;
}
