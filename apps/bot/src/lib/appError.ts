export type ErrorKind = 'invalid_input' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'internal';

export interface AppErrorOptions {
	cause?: unknown;
	ephemeral?: boolean;
	code?: string;
}

export class AppError extends Error {
	public readonly kind: ErrorKind;
	public readonly userMessage: string;
	public readonly ephemeral: boolean | undefined;
	public readonly code: string | undefined;

	public constructor(kind: ErrorKind, userMessage: string, options: AppErrorOptions = {}) {
		super(userMessage, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = 'AppError';
		this.kind = kind;
		this.userMessage = userMessage;
		this.ephemeral = options.ephemeral;
		this.code = options.code;
	}
}

const CUSTOM_EMOJI_MARKUP = /<a?:\w+:\d+>\s*/g;

export function plainUserMessage(error: AppError): string {
	return error.userMessage.replace(CUSTOM_EMOJI_MARKUP, '').trim();
}
