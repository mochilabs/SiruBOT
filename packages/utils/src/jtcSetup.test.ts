import { describe, expect, it } from 'vitest';
import { jtcSetupRequestSchema, jtcSetupResponseSchema } from './jtcSetup.ts';

const REQUEST_ID = 'd7a1f3c5-2b8e-4a9d-8f61-3c2b5e7a9d41';
const GUILD_ID = '123456789012345678';
const USER_ID = '987654321098765432';
const CATEGORY_ID = '192837465051627384';

const VALID_REQUEST = {
	requestId: REQUEST_ID,
	guildId: GUILD_ID,
	userId: USER_ID,
	categoryId: CATEGORY_ID
};

describe('jtcSetup request contract', () => {
	it('accepts a well-formed request', () => {
		const result = jtcSetupRequestSchema.safeParse(VALID_REQUEST);
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.categoryId).toBe(CATEGORY_ID);
	});

	it('rejects a non-uuid requestId', () => {
		expect(jtcSetupRequestSchema.safeParse({ ...VALID_REQUEST, requestId: 'not-a-uuid' }).success).toBe(false);
	});

	it('rejects an empty categoryId', () => {
		expect(jtcSetupRequestSchema.safeParse({ ...VALID_REQUEST, categoryId: '' }).success).toBe(false);
	});

	it('rejects an over-sized guildId', () => {
		expect(jtcSetupRequestSchema.safeParse({ ...VALID_REQUEST, guildId: '1'.repeat(33) }).success).toBe(false);
	});

	it('rejects a missing userId', () => {
		const { userId: _userId, ...withoutUser } = VALID_REQUEST;
		expect(jtcSetupRequestSchema.safeParse(withoutUser).success).toBe(false);
	});
});

describe('jtcSetup response contract', () => {
	it('roundtrips a success response with the marker channel id', () => {
		const result = jtcSetupResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: GUILD_ID,
			markerChannelId: '0192837465f1e2d3c4'
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.markerChannelId).toBe('0192837465f1e2d3c4');
			expect(result.data.error).toBeUndefined();
		}
	});

	it('accepts an error-only response carrying a korean message', () => {
		const result = jtcSetupResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: GUILD_ID,
			error: '카테고리 채널만 선택할 수 있어요.'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.error).toBe('카테고리 채널만 선택할 수 있어요.');
	});

	it('rejects a non-uuid requestId', () => {
		expect(jtcSetupResponseSchema.safeParse({ requestId: 'not-a-uuid', guildId: GUILD_ID }).success).toBe(false);
	});
});
