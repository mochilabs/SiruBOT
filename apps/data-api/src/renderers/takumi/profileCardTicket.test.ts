import { describe, expect, it } from 'vitest';
import { PROFILE_TICKET_WIDTH, renderProfileCardTicket, type ProfileTicketInput } from './profileCardTicket.tsx';

/** 티켓 프로필 카드 스모크 — PNG 계약과 선택 항목(역할·소개·음악)이 비어도 그려지는지 확인해요. */

function baseInput(): ProfileTicketInput {
	return {
		displayName: '시루',
		username: 'siru',
		avatarUrl: null,
		guildTag: 'AB12',
		status: 'online',
		statusLabel: '온라인',
		intro: '안녕하세요, 음악 좋아해요.',
		createdText: '2021. 04. 16',
		joinedText: '2024. 01. 02',
		roleChips: ['DJ', '단골'],
		playlistCount: 12,
		requestedCount: 340,
		topTracks: [{ title: '곡 제목', artist: '아티스트', thumbnailUrl: null }],
		nowPlaying: { title: '지금 듣는 곡', artist: '아티스트', thumbnailUrl: null }
	};
}

const pngSize = (buffer: Buffer) => {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

describe('renderProfileCardTicket', () => {
	it('콘텐츠가 모두 있는 카드를 920폭 PNG로 렌더해요', async () => {
		expect(pngSize(await renderProfileCardTicket(baseInput())).width).toBe(PROFILE_TICKET_WIDTH);
	}, 30_000);

	it('역할·소개·음악이 없어도 렌더돼요', async () => {
		const buffer = await renderProfileCardTicket({ ...baseInput(), roleChips: [], intro: '', topTracks: [], nowPlaying: null });
		expect(buffer.length).toBeGreaterThan(1_000);
		expect(pngSize(buffer).width).toBe(PROFILE_TICKET_WIDTH);
	}, 30_000);
});
