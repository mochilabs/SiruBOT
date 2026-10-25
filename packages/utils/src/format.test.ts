import { describe, expect, it } from 'vitest';
import { emojiProgressBar, formatTrack, getRequesterText, removeEmojis, volumeToEmoji } from './format.ts';
import type { Track } from 'lavalink-client';

// appEmoji 맵이 비어 있어요 — 진행바 셀·아이콘은 전부 유니코드 폴백으로 검증해요.

function track(info: Partial<{ title: string; duration: number; isStream: boolean; uri: string }>): Track {
	return { info: { title: '제목', duration: 65_000, isStream: false, uri: 'https://example.com/t', ...info } } as unknown as Track;
}

describe('emojiProgressBar', () => {
	it('0%는 전 셀이 비어 있고 100%는 전 셀이 차요', () => {
		// 시작/끝 셀에는 캔버스 패딩 폴백(공백)이 붙는다 — start 왼쪽, end 오른쪽.
		expect(emojiProgressBar(0)).toBe(' □□□□□ ');
		expect(emojiProgressBar(1)).toBe(' ■■■■■ ');
	});

	it('반은 채우고 반은 비워요 (셀 경계)', () => {
		// mid_end 셀은 오른쪽 패딩(공백)을 남긴다 — PNG 셀 패딩과 같은 규칙.
		expect(emojiProgressBar(0.5)).toBe(' ■■◐ □□ ');
	});

	it('half 셀은 ◐로 표시해요', () => {
		expect(emojiProgressBar(1 / 10)).toBe(' ◐□□□□ ');
	});

	it('범위 밖·NaN은 클램프해서 처리해요', () => {
		expect(emojiProgressBar(-1)).toBe(' □□□□□ ');
		expect(emojiProgressBar(2)).toBe(' ■■■■■ ');
		expect(emojiProgressBar(Number.NaN)).toBe(' □□□□□ ');
	});

	it('마지막 채워진 셀이 mid면 mid_end 오른쪽 패딩과 end 오른쪽 패딩만 남는다', () => {
		// 0.3 → start_filled + mid_end_half + mid×2 empty + end_empty
		expect(emojiProgressBar(0.3)).toBe(' ■◐ □□□ ');
	});
});

describe('removeEmojis', () => {
	it('이모지만 제거하고 텍스트는 유지해요', () => {
		expect(removeEmojis('안녕😀!')).toBe('안녕!');
		expect(removeEmojis('plain')).toBe('plain');
	});

	it('키캡·조합 이모지(1️⃣ 등)도 제거해요', () => {
		expect(removeEmojis('1️⃣2️⃣abc')).toBe('abc');
	});

	it('이모지 안의 숫자 컴포넌트는 남겨요', () => {
		expect(removeEmojis('😀1😀')).toBe('1');
	});

	it('빈 값은 그대로예요', () => {
		expect(removeEmojis('')).toBe('');
	});
});

describe('volumeToEmoji', () => {
	it('0은 음소거, 33 미만은 낮은 볼륨, 그 이상은 높은 볼륨이에요', () => {
		expect(volumeToEmoji(0)).toBe('🔇');
		expect(volumeToEmoji(10)).toBe('🔉');
		expect(volumeToEmoji(33)).toBe('🔊');
	});
});

describe('getRequesterText', () => {
	it('추천 곡 표시는 sparkle 이모지를 써요', () => {
		expect(getRequesterText({ requester: { id: 'related_track' } } as unknown as Track)).toBe('추천 곡 ✨');
	});

	it('신청자는 멘션으로 표시해요', () => {
		expect(getRequesterText({ requester: { id: '123456789' } } as unknown as Track)).toBe('신청자: <@123456789>');
		expect(getRequesterText({ requester: '123456789' } as unknown as Track)).toBe('신청자: <@123456789>');
	});

	it('신청자가 없으면 빈 문자열이에요', () => {
		expect(getRequesterText({} as unknown as Track)).toBe('');
		expect(getRequesterText({ requester: null } as unknown as Track)).toBe('');
	});
});

describe('formatTrack', () => {
	it('기본은 제목+[mm:ss] 형식이에요', () => {
		expect(formatTrack(track({}))).toBe('제목 [01:05]');
	});

	it('라이브 곡은 [LIVE]를 써요', () => {
		expect(formatTrack(track({ isStream: true }))).toBe('제목 [LIVE]');
	});

	it('길이가 없으면 [N/A]예요', () => {
		expect(formatTrack(track({ duration: 0 }))).toBe('제목 [N/A]');
	});

	it('showLength를 끄면 길이를 붙이지 않아요', () => {
		expect(formatTrack(track({}), { showLength: false })).toBe('제목');
	});

	it('timeType=korean은 한국어 길이를 써요', () => {
		expect(formatTrack(track({}), { timeType: 'korean' })).toBe('제목 [1분 5초]');
	});

	it('withMarkdownURL은 짧은 URL만 링크로 감싸요', () => {
		expect(formatTrack(track({}), { withMarkdownURL: true })).toBe('[제목 [01:05]](https://example.com/t)');
		const longUri = `https://example.com/${'a'.repeat(80)}`;
		expect(formatTrack(track({ uri: longUri }), { withMarkdownURL: true })).toBe('제목 [01:05]');
	});

	it('cleanTitle는 이모지를 제거해요', () => {
		expect(formatTrack(track({ title: '제목🎉' }), { cleanTitle: true })).toBe('제목 [01:05]');
	});

	it('titleLength로 길이 자르기+마스크를 적용해요', () => {
		expect(formatTrack(track({ title: '아주아주긴제목입니다' }), { titleLength: { maxLength: 6 } })).toBe('아주아... [01:05]');
	});
});
