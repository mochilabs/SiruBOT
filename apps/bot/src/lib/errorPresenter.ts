import { UserError } from '@sapphire/framework';
import { AppError, type ErrorKind } from './appError.ts';
import { resolveErrorEphemeral } from './errorView.ts';

export interface ErrorPresentation {
	/** 사용자에게 의도된 안내인지(UserError, AppError) 여부 */
	userFacing: boolean;
	message: string;
	ephemeral: boolean;
	/** Sentry에 보고해야 하는지 여부 */
	report: boolean;
}

const REPORTED_KINDS: ReadonlySet<ErrorKind> = new Set<ErrorKind>(['internal', 'unavailable']);

/**
 * 던져진 값을 분류만 해요. 렌더링과 Sentry 전송은 호출자가 맡아요.
 * @param genericMessage 알 수 없는 오류에 보여줄 호출자별 기본 문구
 */
export function presentError(error: unknown, genericMessage: string): ErrorPresentation {
	if (error instanceof UserError) {
		return { userFacing: true, message: error.message, ephemeral: resolveErrorEphemeral(error), report: false };
	}

	if (error instanceof AppError) {
		const report = REPORTED_KINDS.has(error.kind);
		// 안내성 오류는 UserError처럼 전체공개, 실제 장애(보고 대상)는 일반 오류처럼 ephemeral이 기본이에요.
		return { userFacing: true, message: error.userMessage, ephemeral: error.ephemeral ?? report, report };
	}

	return { userFacing: false, message: genericMessage, ephemeral: true, report: true };
}
