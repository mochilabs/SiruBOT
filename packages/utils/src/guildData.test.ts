import { describe, expect, it } from 'vitest';
import {
	guildChannelItemSchema,
	guildDataKindSchema,
	guildDataRequestSchema,
	guildDataResponseSchema,
	guildMemberItemSchema,
	guildRoleItemSchema
} from './guildData.ts';

const REQUEST_ID = 'd4c0d34d-8a4f-4c8e-9b1e-2f4a6b8c0d10';

function sampleChannel() {
	return { id: '111111111111111111', name: '일반', type: 0, parentId: '222222222222222222', position: 1 };
}

function sampleRole() {
	return { id: '333333333333333333', name: '관리자', color: 15548997, position: 5, managed: false };
}

function sampleMember() {
	return { id: '444444444444444444', displayName: '별명', username: 'account', avatarUrl: 'https://cdn.discordapp.com/avatars/1/2.png' };
}

describe('guildData request contract', () => {
	it('accepts a valid request and keeps fields', () => {
		const result = guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'channels' });
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.kind).toBe('channels');
	});

	it('keeps kind valid for all three kinds', () => {
		expect(guildDataKindSchema.safeParse('channels').success).toBe(true);
		expect(guildDataKindSchema.safeParse('roles').success).toBe(true);
		expect(guildDataKindSchema.safeParse('members').success).toBe(true);
	});

	it('rejects a non-uuid requestId and an unknown kind', () => {
		expect(guildDataRequestSchema.safeParse({ requestId: 'not-a-uuid', guildId: '123', kind: 'channels' }).success).toBe(false);
		expect(guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '123', kind: 'emojis' }).success).toBe(false);
	});

	it('rejects an empty guildId', () => {
		expect(guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '', kind: 'channels' }).success).toBe(false);
	});

	it('accepts a members request with userIds and keeps them', () => {
		const result = guildDataRequestSchema.safeParse({
			requestId: REQUEST_ID,
			guildId: '123456789012345678',
			kind: 'members',
			userIds: ['111111111111111111', '222222222222222222']
		});
		expect(result.success).toBe(true);
		if (result.success) expect(result.data.userIds).toHaveLength(2);
	});

	it('rejects a members batch over 10 and malformed user ids', () => {
		const userIds = Array.from({ length: 11 }, () => '111111111111111111');
		expect(guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'members', userIds }).success).toBe(
			false
		);
		expect(
			guildDataRequestSchema.safeParse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'members', userIds: ['bad id!'] }).success
		).toBe(false);
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

	it('roundtrips a members response with avatarUrl null fallback', () => {
		const request = guildDataRequestSchema.parse({
			requestId: REQUEST_ID,
			guildId: '123456789012345678',
			kind: 'members',
			userIds: ['444444444444444444', '555555555555555555']
		});
		const result = guildDataResponseSchema.safeParse({
			...request,
			members: [sampleMember(), { ...sampleMember(), id: '555555555555555555', displayName: '기본', avatarUrl: null }]
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data.members?.[0]?.displayName).toBe('별명');
			expect(result.data.members?.[1]?.avatarUrl).toBeNull();
		}
	});

	it('rejects a non-uuid requestId and an unknown kind', () => {
		expect(guildDataResponseSchema.safeParse({ requestId: 'not-a-uuid', guildId: '123', kind: 'channels' }).success).toBe(false);
		expect(guildDataResponseSchema.safeParse({ requestId: REQUEST_ID, guildId: '123', kind: 'emojis' }).success).toBe(false);
	});
});

describe('guildData item contracts', () => {
	it('rejects a channel item whose parentId is neither a string nor null', () => {
		expect(guildChannelItemSchema.safeParse({ ...sampleChannel(), parentId: 123 }).success).toBe(false);
	});

	it('rejects a role item without the managed boolean', () => {
		expect(guildRoleItemSchema.safeParse({ id: '333333333333333333', name: '관리자', color: 15548997, position: 5 }).success).toBe(false);
	});

	it('rejects a member item missing displayName', () => {
		expect(guildMemberItemSchema.safeParse({ id: '444444444444444444', username: 'account', avatarUrl: null }).success).toBe(false);
	});

	it('caps members arrays at 10', () => {
		const manyMembers = Array.from({ length: 11 }, () => sampleMember());
		expect(
			guildDataResponseSchema.safeParse({ requestId: REQUEST_ID, guildId: '123456789012345678', kind: 'members', members: manyMembers }).success
		).toBe(false);
	});

	it('rejects non-integer type/color/position and non-string names', () => {
		expect(guildChannelItemSchema.safeParse({ ...sampleChannel(), type: 0.5 }).success).toBe(false);
		expect(guildChannelItemSchema.safeParse({ ...sampleChannel(), position: '0' }).success).toBe(false);
		expect(guildRoleItemSchema.safeParse({ ...sampleRole(), color: '#ff0000' }).success).toBe(false);
		expect(guildRoleItemSchema.safeParse({ ...sampleRole(), name: 1 }).success).toBe(false);
	});

	it('caps oversized channels/roles arrays and rejects 구분자 guildId', () => {
		const requestId = 'b3c1e7a4-9f2d-4c8b-a6e0-1d5f7b9c3a11';
		const manyRoles = Array.from({ length: 501 }, () => sampleRole());
		expect(guildDataResponseSchema.safeParse({ requestId, guildId: 'guild-1', kind: 'roles', roles: manyRoles }).success).toBe(false);
		expect(guildDataResponseSchema.safeParse({ requestId, guildId: 'guild:1', kind: 'roles', roles: [sampleRole()] }).success).toBe(false);
		expect(guildDataRequestSchema.safeParse({ requestId, guildId: 'evil key', kind: 'channels' }).success).toBe(false);
	});
});
