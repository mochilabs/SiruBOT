import { UserError } from '@sapphire/framework';
import { AppError, type ErrorKind } from './appError.ts';
import { resolveErrorEphemeral } from './errorView.ts';

export interface ErrorPresentation {
	userFacing: boolean;
	message: string;
	ephemeral: boolean;
	report: boolean;
	showSupport: boolean;
}

const REPORTED_KINDS: ReadonlySet<ErrorKind> = new Set<ErrorKind>(['internal', 'unavailable']);

export function presentError(error: unknown, genericMessage: string): ErrorPresentation {
	if (error instanceof UserError) {
		return { userFacing: true, message: error.message, ephemeral: resolveErrorEphemeral(error), report: false, showSupport: false };
	}

	if (error instanceof AppError) {
		const report = REPORTED_KINDS.has(error.kind);
		return { userFacing: true, message: error.userMessage, ephemeral: error.ephemeral ?? report, report, showSupport: report };
	}

	return { userFacing: false, message: genericMessage, ephemeral: true, report: true, showSupport: true };
}
