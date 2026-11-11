export type ErrorKind = 'invalid_input' | 'forbidden' | 'not_found' | 'conflict' | 'unavailable' | 'internal';

export interface AppErrorOptions {
	cause?: unknown;
	/** 응답을 본인에게만 보일지 여부. 생략하면 프레젠터가 종류에 따라 정해요. */
	ephemeral?: boolean;
}

/**
 * 프레임워크에 의존하지 않는 애플리케이션 오류예요.
 * `userMessage`는 사용자에게 그대로 보여줄 한국어 문구이고, `message`(Error.message)는 로그용이에요.
 */
export class AppError extends Error {
	public readonly kind: ErrorKind;
	public readonly userMessage: string;
	public readonly ephemeral: boolean | undefined;

	public constructor(kind: ErrorKind, userMessage: string, options: AppErrorOptions = {}) {
		super(userMessage, options.cause === undefined ? undefined : { cause: options.cause });
		this.name = 'AppError';
		this.kind = kind;
		this.userMessage = userMessage;
		this.ephemeral = options.ephemeral;
	}
}
