import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROFILE_CARD_WIDTH, renderProfileCard, type ProfileCardInput, type ProfileCardVariant } from './profileCard.tsx';

const base: Omit<ProfileCardInput, 'variant'> = {
	displayName: '桜姫 시루 🌸',
	username: 'sirubot',
	avatarUrl: null,
	guildTag: 'SIRU',
	status: 'online',
	statusLabel: '온라인',
	intro: '노래 듣는 중이에요. 한자 桜と姫の夜 도 잘 보여요.',
	createdText: '2020. 01. 02',
	joinedText: '2022. 11. 20',
	roleChips: ['DJ', '음악 감상회 운영진', '서버 부스터'],
	playlistCount: 3,
	requestedCount: 1284,
	listenText: '48시간 12분',
	checkinStreak: 12,
	topTracks: [
		{ title: '戦場のメリークリスマス', artist: '坂本龍一', thumbnailUrl: null },
		{ title: 'Spring Day', artist: 'BTS', thumbnailUrl: null }
	],
	nowPlaying: { title: '夜に駆ける', artist: 'YOASOBI', thumbnailUrl: null }
};

describe('renderProfileCard', () => {
	for (const variant of ['dashboard', 'light', 'aura'] as ProfileCardVariant[]) {
		it(`${variant} 템플릿이 PNG로 그려져요`, async () => {
			const png = await renderProfileCard({ ...base, variant });
			expect([...png.subarray(1, 4)]).toEqual([0x50, 0x4e, 0x47]);
			expect(png.readUInt32BE(16)).toBe(PROFILE_CARD_WIDTH);
			if (process.env.PROFILE_PREVIEW_DIR) writeFileSync(`${process.env.PROFILE_PREVIEW_DIR}/profile-${variant}.png`, png);
		});
	}

	it('빈 입력(소개·역할·곡 없음)도 그려져요', async () => {
		const png = await renderProfileCard({
			...base,
			variant: 'dashboard',
			intro: '',
			roleChips: [],
			topTracks: [],
			nowPlaying: null,
			listenText: '',
			checkinStreak: null,
			createdText: '',
			joinedText: ''
		});
		expect(png.length).toBeGreaterThan(1000);
	});
});
