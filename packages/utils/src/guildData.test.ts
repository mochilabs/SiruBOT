import { describe, expect, it } from 'vitest';
import { guildChannelItemSchema, guildDataKindSchema, guildDataRequestSchema, guildDataResponseSchema, guildRoleItemSchema } from './guildData.ts';

const REQUEST_ID = 'd4c0d34d-8a4f-4c8e-9b1e-2f4a6b8c0d10';

function sampleChannel() {
	return { id: '111111111111111111', name: '일반', type: 0, parentId: '222222222222222222', position: 1 };
}

function sampleRole() {
	return { id: '333333333333333333', name: '관리자', color: 15548997, position: 5, managed: false };
}

describe('guildData request contract', () => {
	it('accepts a valid request and keeps fields', () => {
		const result = guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'channels' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.kind).toBe('channels');
	});

	it('keeps kind valid for both kinds', () => {
		expect(guildDataKindSchema.safeParse('channels').success).toBe(true);
		expect(guildDataKindSchema.safeParse('roles').success).toBe(true);
	});

	it('rejects a non-uuid requestId and an unknown kind', () => {
		expect(guildDataRequestSchema.safeParse({ requestId: 'not-a-uuid', guildId: '123', kind: 'channels' }).success).toBe(false);
		expect(guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '123', kind: 'members' }).success).toBe(false);
	});

	it('rejects an empty guildId', () => {
		expect(guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '', kind: 'channels' }).success).toBe(false);
	});
});

describe('guildData response contract', () => {
	it('roundtrips a channels response built from the request contract', () => {
		const request = guildDataRequestSchema.parse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'channels' });
		const result = guildDataResponseSchema.safeParse({ ...request, channels: [sampleChannel()] });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.requestId).toBe(request.requestId);
			expect(result.data.channels?.[0]?.name).toBe('일반');
		}
	});

	it('roundtrips a roles response with managed roles', () => {
		const request = guildDataRequestSchema.parse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'roles' });
		const result = guildDataResponseSchema.safeParse({ ...request, roles: [{ ...sampleRole(), managed: true }] });
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.roles?.[0]?.managed).toBe(true);
			expect(result.data.channels).toBeUndefined();
		}
	});

	it('accepts an error-only response for lookup misses', () => {
		const result = guildDataResponseSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: '123456789012345678',
			kind: 'channels',
			error: 'not_owned'
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.error).toBe('not_owned');
	});

	it('rejects a non-uuid requestId and an unknown kind', () => {
		expect(guildDataResponseSchema.safeParse({ requestId: 'not-a-uuid', guildId: '123', kind: 'channels' }).success).toBe(false);
		expect(guildDataResponseSchema.safeParse({ requestId: REQUEST_ID, guildId: '123', kind: 'members' }).success).toBe(false);
	});
});

describe('guildData item contracts', () => {
	it('rejects a channel item whose parentId is neither a string nor null', () => {
		expect(guildChannelItemSchema.safeParse({ ...sampleChannel(), parentId: 123 }).success).toBe(false);
	});

	it('rejects a role item without the managed boolean', () => {
		expect(guildRoleItemSchema.safeParse({ id: '333333333333333333', name: '관리자', color: 15548997, position: 5 }).success).toBe(false);
	});

	it('rejects non-integer type/color/position and non-string names', () => {
		expect(guildChannelItemSchema.safeParse({ ...sampleChannel(), type: 0.5 }).success).toBe(false);
		expect(guildChannelItemSchema.safeParse({ ...sampleChannel(), position: '0' }).success).toBe(false);
		expect(guildRoleItemSchema.safeParse({ ...sampleRole(), color: '#ff0000' }).success).toBe(false);
		expect(guildRoleItemSchema.safeParse({ ...sampleRole(), name: 1 }).success).toBe(false);
	});
});
