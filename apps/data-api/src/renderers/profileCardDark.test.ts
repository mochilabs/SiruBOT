import { describe, expect, it } from 'vitest';
import { renderProfileCardDark, type ProfileCardDarkInput } from './profileCardDark.ts';

/**
 * 다크 프로필 카드 스모크 — PNG 계약과 헤더 그라디언트 시작색을 잠가요.
 * 시작색은 헤더 좌상단 흰 글씨(핸들·PROFILE 라벨) 대비의 기준이라 함께 검증해요.
 */

function baseInput(): ProfileCardDarkInput {
	return {
		userId: '123456789012345678',
		profileId: 'siru',
		displayName: '시루',
		avatarUrl: null,
		guildTag: 'AB12',
		guildTagBadgeUrl: null,
		status: 'online',
		onlineLabel: '온라인',
		statusColor: '#3ecf8e',
		intro: '안녕하세요, 음악 좋아해요.',
		createdText: '2021. 04. 16',
		joinedText: '2024. 01. 02',
		roleChips: ['DJ', '단골'],
		topTracks: [{ title: '곡 제목', artist: '아티스트', thumbnailUrl: null }],
		nowPlaying: { title: '지금 듣는 곡', artist: '아티스트', thumbnailUrl: null }
	};
}

/** PNG 매직 + IHDR 너비/높이(각각 16/20 바이트 오프셋 big-endian) */
function pngSize(buffer: Buffer): { width: number; height: number } {
	expect([buffer[0], buffer[1], buffer[2], buffer[3]]).toEqual([137, 80, 78, 71]);
	return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function headerStartPixel(): Promise<[number, number, number]> {
	const buffer = await renderProfileCardDark(baseInput());
	const { loadImage, Canvas } = await import('skia-canvas');
	const img = await loadImage(buffer);
	const canvas = new Canvas(920, 400);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(img, 0, 0);
	// (1,1)은 별·물결 하이라이트가 없는 헤더 좌상단이라 그라디언트 시작색 그대로예요.
	return Array.from(ctx.getImageData(1, 1, 1, 1).data.slice(0, 3)) as [number, number, number];
}

describe('renderProfileCardDark', () => {
	it('콘텐츠가 모두 있는 카드를 920폭 PNG로 렌더해요', async () => {
		const { width, height } = pngSize(await renderProfileCardDark(baseInput()));
		expect(width).toBe(920);
		expect(height).toBeGreaterThanOrEqual(400);
	});

	it('역할·소개·음악이 없어도 렌더돼요', async () => {
		const buffer = await renderProfileCardDark({ ...baseInput(), roleChips: [], intro: '', topTracks: [], nowPlaying: undefined });
		expect(buffer.length).toBeGreaterThan(1_000);
		expect(pngSize(buffer).width).toBe(920);
	});

	it('헤더 그라디언트 시작색이 흰 글씨 대비 기준(#8a68bd)을 유지해요', async () => {
		const [r, g, b] = await headerStartPixel();
		expect(Math.abs(r - 0x8a)).toBeLessThanOrEqual(4);
		expect(Math.abs(g - 0x68)).toBeLessThanOrEqual(4);
		expect(Math.abs(b - 0xbd)).toBeLessThanOrEqual(4);
	});
});
