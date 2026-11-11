import { describe, expect, it } from 'vitest';
import { AppError, plainUserMessage } from './appError.ts';

describe('AppError', () => {
	it('kind와 userMessage를 보존하고 Error를 상속해요', () => {
		const error = new AppError('not_found', '찾을 수 없어요.');
		expect(error).toBeInstanceOf(Error);
		expect(error.name).toBe('AppError');
		expect(error.kind).toBe('not_found');
		expect(error.userMessage).toBe('찾을 수 없어요.');
		expect(error.message).toBe('찾을 수 없어요.');
		expect(error.ephemeral).toBeUndefined();
		expect(error.cause).toBeUndefined();
	});

	it('cause와 ephemeral 옵션을 받아요', () => {
		const cause = new Error('원인');
		const error = new AppError('internal', '오류예요.', { cause, ephemeral: false });
		expect(error.cause).toBe(cause);
		expect(error.ephemeral).toBe(false);
	});
});

describe('plainUserMessage', () => {
	it('앱 이모지 마크업을 지우고 유니코드 이모지와 본문은 그대로 둬요', () => {
		expect(plainUserMessage(new AppError('forbidden', '<:link:123456789> 같은 채널에 있어야 해요.'))).toBe('같은 채널에 있어야 해요.');
		expect(plainUserMessage(new AppError('forbidden', '<a:spin:42> 잠시만요'))).toBe('잠시만요');
		expect(plainUserMessage(new AppError('forbidden', '🔗 같은 채널에 있어야 해요.'))).toBe('🔗 같은 채널에 있어야 해요.');
	});
});
