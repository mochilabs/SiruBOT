import { describe, expect, it, vi } from 'vitest';

vi.mock('@sapphire/framework', () => ({
	UserError: class UserError extends Error {
		public identifier: string;
		public context: unknown;
		public constructor(options: { identifier: string; message: string; context?: unknown }) {
			super(options.message);
			this.name = 'UserError';
			this.identifier = options.identifier;
			this.context = options.context;
		}
	}
}));

import { UserError } from '@sapphire/framework';
import { AppError, type ErrorKind } from './appError.ts';
import { presentError } from './errorPresenter.ts';

const GENERIC = '기본 오류 문구';

describe('presentError', () => {
	it('UserError는 메시지를 그대로 쓰고 보고하지 않으며 기본은 전체공개예요', () => {
		const result = presentError(new UserError({ identifier: 'x', message: '안내예요.' }), GENERIC);
		expect(result).toEqual({ userFacing: true, message: '안내예요.', ephemeral: false, report: false });
	});

	it('UserError의 context.ephemeral을 따라요', () => {
		const result = presentError(new UserError({ identifier: 'x', message: '안내', context: { ephemeral: true } }), GENERIC);
		expect(result.ephemeral).toBe(true);
	});

	it.each<[ErrorKind, boolean]>([
		['invalid_input', false],
		['forbidden', false],
		['not_found', false],
		['conflict', false],
		['unavailable', true],
		['internal', true]
	])('AppError(%s)는 report=%s예요', (kind, report) => {
		const result = presentError(new AppError(kind, '사용자 문구'), GENERIC);
		expect(result).toEqual({ userFacing: true, message: '사용자 문구', ephemeral: report, report });
	});

	it('AppError의 ephemeral 옵션이 기본값보다 우선해요', () => {
		expect(presentError(new AppError('internal', 'a', { ephemeral: false }), GENERIC).ephemeral).toBe(false);
		expect(presentError(new AppError('not_found', 'a', { ephemeral: true }), GENERIC).ephemeral).toBe(true);
	});

	it('일반 Error는 호출자 기본 문구로 보고 대상이에요', () => {
		expect(presentError(new Error('boom'), GENERIC)).toEqual({ userFacing: false, message: GENERIC, ephemeral: true, report: true });
	});

	it('Error가 아닌 값도 안전하게 처리해요', () => {
		for (const value of ['문자열', 42, null, undefined, { a: 1 }]) {
			expect(presentError(value, GENERIC)).toEqual({ userFacing: false, message: GENERIC, ephemeral: true, report: true });
		}
	});
});
