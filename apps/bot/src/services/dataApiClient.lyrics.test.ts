import { describe, expect, it } from 'vitest';
import { GatewayDomainError, isLyricsNotFound } from './dataApiClient.ts';

describe('isLyricsNotFound', () => {
	it('treats data-api not-found answers as no results', () => {
		expect(isLyricsNotFound(new GatewayDomainError('lyrics_not_found', '가사를 찾지 못했어요.'))).toBe(true);
	});

	it('keeps real failures as errors', () => {
		expect(isLyricsNotFound(new GatewayDomainError('internal_error', 'boom'))).toBe(false);
		expect(isLyricsNotFound(new GatewayDomainError('not_found', 'route missing'))).toBe(false);
		expect(isLyricsNotFound(new GatewayDomainError('data_api_404', 'data-api 404'))).toBe(false);
		expect(isLyricsNotFound(new Error('timeout'))).toBe(false);
	});
});
