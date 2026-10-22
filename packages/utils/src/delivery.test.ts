import { describe, expect, it } from 'vitest';
import { DeliveryError, normalizeTrackingNumber } from './delivery.ts';

describe('normalizeTrackingNumber', () => {
	it('공백·하이픈을 전부 제거해요', () => {
		expect(normalizeTrackingNumber('1234 5678-9012')).toBe('123456789012');
		expect(normalizeTrackingNumber('  123456789012  ')).toBe('123456789012');
	});

	it('탭·개행 등 모든 whitespace를 제거해요', () => {
		expect(normalizeTrackingNumber('1234\t5678\n9012')).toBe('123456789012');
	});

	it('빈 입력은 빈 문자열로 남아요 (호출 쪽에서 필수값 검증)', () => {
		expect(normalizeTrackingNumber('')).toBe('');
		expect(normalizeTrackingNumber('   -  ')).toBe('');
	});
});

describe('DeliveryError', () => {
	it('identifier·message·name을 식별자로 가지고 instanceof Error예요', () => {
		const error = new DeliveryError('delivery_track_not_found', '택배사 또는 운송장번호를 찾을 수 없어요.');
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('DeliveryError');
		expect(error.identifier).toBe('delivery_track_not_found');
		expect(error.message).toBe('택배사 또는 운송장번호를 찾을 수 없어요.');
	});
});
