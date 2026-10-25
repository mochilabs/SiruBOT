export const BOT_NAME = '시루봇';

/** 음성 채널 미접속 안내 — 재생·검색·즐겨찾기·플레이리스트 커맨드와 AI 음악 도구가 공유해요 */
export const VOICE_CHANNEL_REQUIRED_MESSAGE = '먼저 음성 채널에 접속해 주세요.';

// 기본 색상 — 앱 이모지 accent와 맞춘 색이에요 (render-emojis.mjs의 accent와 동일해야 해요)
export const DEFAULT_COLOR = 0xff85c0;
export const WARN_COLOR = 0xf56565;

/**
 * 진행바 앱 이모지 셀 (resources/emoji_replacement/pb_*.png → 앱 이모지).
 * 한 바는 5셀: start + mid×3 + end. 셀당 2스텝, half 셀이 중간 스텝을 담당해요.
 * pb_mid_end_*: 진행바의 마지막 채워진 세그먼트가 mid일 때 accent 끝을 라운드 처리한 셀이에요.
 */
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
/** 셀당 스텝 수 — start/mid/end 각 half 셀 표현용 (5셀 × 2스텝 = 전체 10스텝, 상태값 s는 0~10) */
export const PROGRESS_BAR_STEPS_PER_CELL = 2;
