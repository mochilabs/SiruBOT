import { describe, expect, it } from 'vitest';
import { SongPlaying } from './SongPlaying.ts';

describe('현재곡이 필요한 명령', () => {
	it.each([true, false])('일시정지=%s에서도 현재곡을 조회하고 제어할 수 있어요', (paused) => {
		const gate = { container: { audio: { getPlayer: () => ({ queue: { current: {} }, paused }) } } };
		expect(SongPlaying.prototype.check.call(gate as unknown as SongPlaying, 'guild')).toBe(true);
	});
	it('현재곡이 없으면 거절해요', () => {
		const gate = { container: { audio: { getPlayer: () => ({ queue: { current: null }, paused: false }) } } };
		expect(SongPlaying.prototype.check.call(gate as unknown as SongPlaying, 'guild')).toBe(false);
	});
});
