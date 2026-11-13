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

/** 디스코드 앱 이모지 마크업(`<:name:id>`, `<a:name:id>`)과 그 뒤 공백 — 웹·AI처럼 마크업이 렌더되지 않는 곳에서는 지워요. */
const CUSTOM_EMOJI_MARKUP = /<a?:\w+:\d+>\s*/g;

/** 디스코드 밖(대시보드, AI 도구 결과)에 보여줄 안내 문구 — `userMessage`에서 앱 이모지 마크업만 제거해요. */
export function plainUserMessage(error: AppError): string {
	return error.userMessage.replace(CUSTOM_EMOJI_MARKUP, '').trim();
}
