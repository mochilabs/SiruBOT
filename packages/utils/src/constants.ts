export const BOT_NAME = '시루봇';

// 기본 색상
export const DEFAULT_COLOR = 0xffdaff;
export const OK_COLOR = 0x4299e1;
export const WARN_COLOR = 0xf56565;

export const AUTOCOMPLETE_MAX_RESULT = 25;
export const PAGE_CHUNK_SIZE = 10;

/**
 * 진행바 앱 이모지 셀 (resources/emoji_replacement/pb_*.png → 앱 이모지).
 * 한 바는 6셀: start + mid×4 + end. 셀당 2스텝(총 12스텝), half 셀이 중간 스텝을 담당해요.
 */
export const PROGRESS_BAR_EMOJI_NAMES = {
	start_empty: 'pb_start_empty',
	start_half: 'pb_start_half',
	start_filled: 'pb_start_filled',
	mid_empty: 'pb_mid_empty',
	mid_half: 'pb_mid_half',
	mid_filled: 'pb_mid_filled',
	end_empty: 'pb_end_empty',
	end_half: 'pb_end_half',
	end_filled: 'pb_end_filled'
} as const;

export const PROGRESS_BAR_EMOJI_COUNT = 6;
/** 셀당 스텝 수 — start/mid/end 각 half 셀 표현용 (총 6셀 × 2스텝 - 경계 1 = 진행 스텝 11단계) */
export const PROGRESS_BAR_STEPS_PER_CELL = 2;
