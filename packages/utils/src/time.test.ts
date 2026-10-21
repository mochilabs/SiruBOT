import { describe, expect, it } from 'vitest';
import { formatDuration, formatUptime } from './time.ts';

// formatUptime/formatDuration은 apps/dashboard/src/lib/format.ts에서 승격된 함수예요.
// 출력 계약(분 미패딩·시간 자리 없음 등)을 여기서 고정해요 — formatTime(format.ts)과 다르게 동작하는 게 의도예요.

describe('formatUptime', () => {
	it('1시간 미만은 분만 표기해요', () => {
		expect(formatUptime(0)).toBe('0분');
		expect(formatUptime(900)).toBe('15분');
		expect(formatUptime(3599.9)).toBe('59분');
	});

	it('1일 미만은 시간+분을 표기해요', () => {
		expect(formatUptime(3600)).toBe('1시간 0분');
		expect(formatUptime(4200)).toBe('1시간 10분');
	});

	it('1일 이상은 일+시간만 표기해요 (분 생략)', () => {
		expect(formatUptime(86400)).toBe('1일 0시간');
		expect(formatUptime(90060)).toBe('1일 1시간');
	});
});

describe('formatDuration', () => {
	it('밀리초를 m:ss로 표기해요 (분은 패딩하지 않아요)', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(5000)).toBe('0:05');
		expect(formatDuration(65000)).toBe('1:05');
		expect(formatDuration(599999)).toBe('9:59');
	});

	it('1시간 이상이어도 분으로 환산해요 (시간 자리 없음)', () => {
		expect(formatDuration(3600000)).toBe('60:00');
		expect(formatDuration(3723000)).toBe('62:03');
	});
});
