import { z } from 'zod';
import { isValidRolePanelEmoji, rolePanelEmojiKey } from './rolePanel.js';

/**
 * 스타보드 계약 — 반응이 기준 수 이상 달린 메시지를 스타보드 채널에 모아요. 봇과 대시보드가 함께 써요.
 * 저장은 Prisma `StarboardSettings`(서버별 1행)이고, 봇이 게시한 글은 `StarboardEntry`가 원문과 이어 줘요.
 */

export const STARBOARD_DEFAULT_EMOJI = '⭐';
export const STARBOARD_THRESHOLD_MIN = 1;
export const STARBOARD_THRESHOLD_MAX = 50;
export const STARBOARD_THRESHOLD_DEFAULT = 3;
/** 무시할 채널 목록의 최대 길이 */
export const STARBOARD_IGNORED_CHANNELS_MAX = 25;

const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');

const emojiSchema = z
	.string()
	.max(100)
	.refine(isValidRolePanelEmoji, '올바른 이모지가 아니에요. 유니코드 이모지나 서버 커스텀 이모지만 쓸 수 있어요.');

const thresholdSchema = z
	.number()
	.int('기준 수는 정수여야 해요.')
	.min(STARBOARD_THRESHOLD_MIN, `기준 수는 ${STARBOARD_THRESHOLD_MIN} 이상이어야 해요.`)
	.max(STARBOARD_THRESHOLD_MAX, `기준 수는 ${STARBOARD_THRESHOLD_MAX} 이하여야 해요.`);

const ignoredChannelsSchema = z
	.array(snowflake, '채널 ID 목록이 올바르지 않아요.')
	.max(STARBOARD_IGNORED_CHANNELS_MAX, `무시할 채널은 최대 ${STARBOARD_IGNORED_CHANNELS_MAX}개까지 설정할 수 있어요.`);

/** 서버 스타보드 설정 전체 — channelId가 null이면 꺼진 상태예요 */
export const starboardSettingsSchema = z.object({
	channelId: snowflake.nullable(),
	emoji: emojiSchema,
	threshold: thresholdSchema,
	excludeSelf: z.boolean(),
	excludeNsfw: z.boolean(),
	ignoredChannelIds: ignoredChannelsSchema
});
export type StarboardSettings = z.infer<typeof starboardSettingsSchema>;

/** 대시보드 저장 본문 — 바꾼 필드만 보내요 */
export const starboardSettingsPatchSchema = starboardSettingsSchema.partial();
export type StarboardSettingsPatch = z.infer<typeof starboardSettingsPatchSchema>;

export const STARBOARD_SETTINGS_DEFAULTS: StarboardSettings = {
	channelId: null,
	emoji: STARBOARD_DEFAULT_EMOJI,
	threshold: STARBOARD_THRESHOLD_DEFAULT,
	excludeSelf: true,
	excludeNsfw: true,
	ignoredChannelIds: []
};

/**
 * 저장된 이모지 설정이 반응 이벤트의 이모지와 같은지 — 커스텀은 id, 유니코드는 변형 선택자를 뗀 문자로 비교해요.
 * 이벤트의 이모지는 커스텀이면 id가, 유니코드면 name만 있어요.
 */
export function starboardEmojiMatches(setting: string, reactionEmoji: { id: string | null; name: string | null }): boolean {
	const key = rolePanelEmojiKey(setting);
	if (reactionEmoji.id) return key === reactionEmoji.id;
	return reactionEmoji.name !== null && key === rolePanelEmojiKey(reactionEmoji.name);
}
