import { describe, expect, it } from 'vitest';
import { renderProfileCardTicket, type ProfileCardTicketInput } from './profileCardTicket.ts';

/**
 * 티켓 프로필 카드 스모크 — 크림/세이지 프리셋의 PNG 계약과
 * 역할 캡슐·스탯·음악 섹션까지 그리는 경로를 한 번에 확인해요.
 */

function baseInput(): ProfileCardTicketInput {
	return {
		userId: '123456789012345678',
		profileId: 'siru',
		displayName: '시루',
		avatarUrl: null,
		guildTag: 'AB12',
		guildTagBadgeUrl: null,
		status: 'online',
		onlineLabel: '온라인',
		statusColor: '#2f9e5f',
		intro: '안녕하세요, 음악 좋아해요.',
		createdText: '2021. 04. 16',
		joinedText: '2024. 01. 02',
		roleChips: ['DJ', '단골'],
		stats: [
			{ label: '플레이리스트', value: '12개', icon: 'list-music' },
			{ label: '신청한 곡', value: '340곡', icon: 'music' }
		],
		topTracks: [{ title: '곡 제목', artist: '아티스트', thumbnailUrl: null }],
		nowPlaying: { title: '지금 듣는 곡', artist: '아티스트', thumbnailUrl: null }
	};
}

/** PNG 매직 + IHDR 너비/높이(각각 16/20 바이트 오프셋 big-endian) */
function pngSize(buffer: Buffer): { width: number; height: number } {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe('renderProfileCardTicket', () => {
	it('콘텐츠가 모두 있는 카드를 920폭 PNG로 렌더해요', async () => {
		const { width, height } = pngSize(await renderProfileCardTicket(baseInput()));
		expect(width).toBe(920);
		expect(height).toBeGreaterThanOrEqual(560);
	});

	it('역할·소개·스탯·음악이 없어도 빈 칸 없이 렌더돼요', async () => {
		const input: ProfileCardTicketInput = { ...baseInput(), roleChips: [], intro: '', stats: undefined, topTracks: [], nowPlaying: undefined };
		const buffer = await renderProfileCardTicket(input);
		expect(buffer.length).toBeGreaterThan(1_000);
		expect(pngSize(buffer).width).toBe(920);
	});
});
