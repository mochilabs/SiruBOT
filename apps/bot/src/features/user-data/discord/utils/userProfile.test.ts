import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearUserIntro, isValidIntro, setUserIntro } from './userProfile.ts';

const { upsert, update, findUnique } = vi.hoisted(() => ({ upsert: vi.fn(), update: vi.fn(), findUnique: vi.fn() }));
vi.mock('@sapphire/framework', () => ({ container: { db: { user: { upsert, update, findUnique } } } }));

beforeEach(() => {
	upsert.mockReset();
	update.mockReset();
	findUnique.mockReset();
});

describe('isValidIntro', () => {
	it('1~120자를 받아들여요', () => {
		expect(isValidIntro('음악과 함께 보내는 시간을 좋아해요.')).toBe(true);
		expect(isValidIntro('a'.repeat(120))).toBe(true);
	});

	it('빈 문자열·공백·121자는 거절해요', () => {
		expect(isValidIntro('')).toBe(false);
		expect(isValidIntro('   ')).toBe(false);
		expect(isValidIntro('a'.repeat(121))).toBe(false);
	});
});

describe('setUserIntro', () => {
	it('앞뒤 공백을 정리해 저장해요', async () => {
		upsert.mockResolvedValue({});
		await expect(setUserIntro('user', '  코딩할 때 듣는 음악  ')).resolves.toBe(true);
		expect(upsert).toHaveBeenCalledWith({
			where: { id: 'user' },
			create: { id: 'user', intro: '코딩할 때 듣는 음악' },
			update: { intro: '코딩할 때 듣는 음악' }
		});
	});

	it('유효하지 않으면 저장하지 않아요', async () => {
		await expect(setUserIntro('user', '   ')).resolves.toBe(false);
		expect(upsert).not.toHaveBeenCalled();
	});
});

describe('clearUserIntro', () => {
	it('등록된 소개를 지우고 true를 돌려줘요', async () => {
		findUnique.mockResolvedValue({ intro: '코딩할 때 듣는 음악' });
		update.mockResolvedValue({});
		await expect(clearUserIntro('user')).resolves.toBe(true);
		expect(update).toHaveBeenCalledWith({ where: { id: 'user' }, data: { intro: null } });
	});

	it('소개가 없으면 지우지 않고 false를 돌려줘요', async () => {
		findUnique.mockResolvedValue({ intro: null });
		await expect(clearUserIntro('user')).resolves.toBe(false);
		expect(update).not.toHaveBeenCalled();

		findUnique.mockResolvedValue(null);
		await expect(clearUserIntro('user')).resolves.toBe(false);
		expect(update).not.toHaveBeenCalled();
	});
});
