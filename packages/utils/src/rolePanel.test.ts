import { describe, expect, it } from 'vitest';
import {
	buildRolePanelCustomId,
	parseRolePanelCustomId,
	ROLE_PANEL_CUSTOM_ID_PREFIX,
	ROLE_PANEL_MAX_BUTTONS,
	rolePanelButtonsSchema,
	rolePanelUpdateSchema,
	rolePanelCreateSchema,
	isValidRolePanelEmoji,
	rolePanelEmojiKey,
	validateReactionButtons,
	rolePanelSchema,
	roleValidationRequestSchema
} from './rolePanel.ts';

const BUTTON_ID = '123e4567-e89b-12d3-a456-426614174000';
const ROLE_ID = '123456789012345678';

describe('buildRolePanelCustomId / parseRolePanelCustomId', () => {
	it('빌드한 customId를 왕복 파싱한다', () => {
		const customId = buildRolePanelCustomId(BUTTON_ID, ROLE_ID);
		expect(customId).toBe(`${ROLE_PANEL_CUSTOM_ID_PREFIX}${BUTTON_ID}:${ROLE_ID}`);
		expect(parseRolePanelCustomId(customId)).toEqual({ buttonId: BUTTON_ID, roleId: ROLE_ID });
	});

	it('customId 길이가 100자 상한 아래다', () => {
		const customId = buildRolePanelCustomId(BUTTON_ID, ROLE_ID);
		expect(customId.length).toBeLessThanOrEqual(100);
	});

	it('다른 prefix면 null을 돌려준다', () => {
		expect(parseRolePanelCustomId('ticket:open')).toBeNull();
		expect(parseRolePanelCustomId('settings:mixer')).toBeNull();
	});

	it('형식이 깨진 customId는 null을 돌려준다', () => {
		expect(parseRolePanelCustomId(ROLE_PANEL_CUSTOM_ID_PREFIX)).toBeNull();
		expect(parseRolePanelCustomId(`${ROLE_PANEL_CUSTOM_ID_PREFIX}buttonid`)).toBeNull();
		expect(parseRolePanelCustomId(`${ROLE_PANEL_CUSTOM_ID_PREFIX}:roleid`)).toBeNull();
		expect(parseRolePanelCustomId(`${ROLE_PANEL_CUSTOM_ID_PREFIX}buttonid:`)).toBeNull();
	});
});

describe('rolePanelSchema', () => {
	it('기본값으로 올바르게 파싱된다', () => {
		const parsed = rolePanelSchema.parse({ name: '게임' });
		expect(parsed.title).toBe('역할 패널');
		expect(parsed.description).toBe('아래 버튼을 눌러 원하는 역할을 받거나 해제하세요.');
		expect(parsed.channelId).toBeNull();
		expect(parsed.messageId).toBeNull();
	});

	it('이름이 없으면 검증에 실패한다', () => {
		expect(rolePanelSchema.safeParse({}).success).toBe(false);
	});

	it('수정(PUT) 스키마는 부분 수정을 허용한다', () => {
		const patch = rolePanelUpdateSchema.parse({ title: '새 제목' });
		expect(patch.title).toBe('새 제목');
		expect(patch.name).toBeUndefined();
		expect(patch.buttons).toBeUndefined();
	});

	it('생성 스키마는 이름만 있으면 버튼을 빈 배열로 채운다', () => {
		const parsed = rolePanelCreateSchema.parse({ name: '게임' });
		expect(parsed.buttons).toEqual([]);
		expect(rolePanelCreateSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false);
	});
});

describe('rolePanelButtonsSchema', () => {
	it('버튼 목록을 수용하고 position 기본값을 채운다', () => {
		const parsed = rolePanelButtonsSchema.parse([{ roleId: ROLE_ID, label: '게임', style: 'primary' }]);
		expect(parsed[0].position).toBe(0);
		expect(parsed[0].emoji).toBeNull();
	});

	it('상한(25)을 초과하면 검증에 실패한다', () => {
		const buttons = Array.from({ length: ROLE_PANEL_MAX_BUTTONS + 1 }, (_, i) => ({
			roleId: ROLE_ID,
			label: `역할 ${i}`
		}));
		expect(rolePanelButtonsSchema.safeParse(buttons).success).toBe(false);
	});

	it('잘못된 roleId는 검증에 실패한다', () => {
		const result = rolePanelButtonsSchema.safeParse([{ roleId: 'not-a-snowflake', label: '게임' }]);
		expect(result.success).toBe(false);
	});
});

describe('roleValidationRequestSchema', () => {
	it('유효한 요청을 수용한다', () => {
		const parsed = roleValidationRequestSchema.parse({
			requestId: '123e4567-e89b-12d3-a456-426614174000',
			guildId: 'guild-1',
			roleIds: [ROLE_ID]
		});
		expect(parsed.roleIds).toEqual([ROLE_ID]);
	});

	it('상한을 초과한 roleIds는 검증에 실패한다', () => {
		const roleIds = Array.from({ length: ROLE_PANEL_MAX_BUTTONS + 1 }, () => ROLE_ID);
		const result = roleValidationRequestSchema.safeParse({
			requestId: '123e4567-e89b-12d3-a456-426614174000',
			guildId: 'guild-1',
			roleIds
		});
		expect(result.success).toBe(false);
	});
});

describe('버튼 이모지 / id 검증', () => {
	it('유니코드·커스텀 이모지는 통과하고 그 외는 거부한다', () => {
		expect(isValidRolePanelEmoji('🎮')).toBe(true);
		expect(isValidRolePanelEmoji('<:game:123456789012345678>')).toBe(true);
		expect(isValidRolePanelEmoji('<a:party:123456789012345678>')).toBe(true);
		expect(isValidRolePanelEmoji(':smile:')).toBe(false);
		expect(isValidRolePanelEmoji('hello')).toBe(false);
		expect(isValidRolePanelEmoji('🎮🎮')).toBe(false);
	});

	it('잘못된 이모지가 든 버튼은 스키마에서 거부한다', () => {
		expect(rolePanelButtonsSchema.safeParse([{ roleId: ROLE_ID, label: 'a', emoji: ':smile:' }]).success).toBe(false);
		expect(rolePanelButtonsSchema.safeParse([{ roleId: ROLE_ID, label: 'a', emoji: '🎮' }]).success).toBe(true);
	});

	it('기존 버튼 id는 uuid만 받고 중복은 거부한다', () => {
		expect(rolePanelButtonsSchema.safeParse([{ id: BUTTON_ID, roleId: ROLE_ID, label: 'a' }]).success).toBe(true);
		expect(rolePanelButtonsSchema.safeParse([{ id: 'temp-1', roleId: ROLE_ID, label: 'a' }]).success).toBe(false);
		expect(
			rolePanelButtonsSchema.safeParse([
				{ id: BUTTON_ID, roleId: ROLE_ID, label: 'a' },
				{ id: BUTTON_ID, roleId: ROLE_ID, label: 'b' }
			]).success
		).toBe(false);
	});
});

describe('반응 모드 규칙', () => {
	it('이모지 키는 커스텀은 id, 유니코드는 변형 선택자를 뗀 문자다', () => {
		expect(rolePanelEmojiKey('<:game:123456789012345678>')).toBe('123456789012345678');
		expect(rolePanelEmojiKey('<a:party:123456789012345678>')).toBe('123456789012345678');
		expect(rolePanelEmojiKey('❤️')).toBe(rolePanelEmojiKey('❤'));
	});

	it('이모지가 없거나 중복이거나 20개를 넘으면 사유를 돌려준다', () => {
		expect(validateReactionButtons([{ emoji: '🎮' }, { emoji: '🎵' }])).toBeNull();
		expect(validateReactionButtons([{ emoji: '🎮' }, { emoji: null }])).not.toBeNull();
		expect(validateReactionButtons([{ emoji: '🎮' }, { emoji: '🎮' }])).not.toBeNull();
		expect(
			validateReactionButtons(Array.from({ length: 21 }, (_, i) => ({ emoji: `<:e${i}x:1234567890123456${String(i).padStart(2, '0')}>` })))
		).not.toBeNull();
	});

	it('생성 스키마는 mode 기본값이 button이고 reaction이면 규칙을 검사한다', () => {
		expect(rolePanelCreateSchema.parse({ name: 'a' }).mode).toBe('button');
		expect(rolePanelCreateSchema.safeParse({ name: 'a', mode: 'reaction', buttons: [{ roleId: ROLE_ID, label: 'a' }] }).success).toBe(false);
		expect(
			rolePanelCreateSchema.safeParse({ name: 'a', mode: 'reaction', buttons: [{ roleId: ROLE_ID, label: 'a', emoji: '🎮' }] }).success
		).toBe(true);
		expect(rolePanelCreateSchema.safeParse({ name: 'a', mode: 'bogus' }).success).toBe(false);
	});

	it('수정 스키마는 mode가 없으면 기존 동작 그대로다', () => {
		expect(rolePanelUpdateSchema.safeParse({ buttons: [{ roleId: ROLE_ID, label: 'a' }] }).success).toBe(true);
	});
});
