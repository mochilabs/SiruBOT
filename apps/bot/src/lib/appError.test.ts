import { describe, expect, it } from 'vitest';
import { AppError } from './appError.ts';

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
