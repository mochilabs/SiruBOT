import { describe, expect, it } from 'vitest';
import { resolveFallbackTextFromToolResults } from './agentFallback.ts';
import type { ChatMessage } from './types.ts';

describe('resolveFallbackTextFromToolResults', () => {
	it('extracts error field when tool returns error', () => {
		const messages: ChatMessage[] = [
			{ role: 'user', content: 'test' },
			{
				role: 'tool',
				tool_call_id: 'call_1',
				content: JSON.stringify({ error: '인자가 올바르지 않아요.' })
			}
		];
		expect(resolveFallbackTextFromToolResults(messages)).toBe('요청을 처리하지 못했어요: 인자가 올바르지 않아요.');
	});

	it('extracts message field when tool returns message', () => {
		const messages: ChatMessage[] = [
			{
				role: 'tool',
				tool_call_id: 'call_1',
				content: JSON.stringify({ message: '기억을 저장했어요.' })
			}
		];
		expect(resolveFallbackTextFromToolResults(messages)).toBe('기억을 저장했어요.');
	});

	it('extracts text field when tool returns text', () => {
		const messages: ChatMessage[] = [
			{
				role: 'tool',
				tool_call_id: 'call_1',
				content: JSON.stringify({ text: '검색된 내용 요약입니다.' })
			}
		];
		expect(resolveFallbackTextFromToolResults(messages)).toBe('검색된 내용 요약입니다.');
	});

	it('returns default success message on ok or success status', () => {
		const messages: ChatMessage[] = [
			{
				role: 'tool',
				tool_call_id: 'call_1',
				content: JSON.stringify({ status: 'ok', added: true })
			}
		];
		expect(resolveFallbackTextFromToolResults(messages)).toBe('요청하신 작업을 완료했어요.');
	});

	it('returns default failure message on error status', () => {
		const messages: ChatMessage[] = [
			{
				role: 'tool',
				tool_call_id: 'call_1',
				content: JSON.stringify({ status: 'error' })
			}
		];
		expect(resolveFallbackTextFromToolResults(messages)).toBe('요청을 처리하지 못했어요.');
	});

	it('returns empty string when there are no tool messages', () => {
		const messages: ChatMessage[] = [
			{ role: 'user', content: '안녕' },
			{ role: 'assistant', content: '' }
		];
		expect(resolveFallbackTextFromToolResults(messages)).toBe('');
	});
});
