import { AppError, plainUserMessage } from '../../../../lib/appError.ts';
import type { Actor, MusicToolPort } from '../../../music/index.ts';
import type { AiToolContext } from './types.ts';

export function musicActor(ctx: AiToolContext, port: Pick<MusicToolPort, 'actorFromMember'>): Actor {
	if (!ctx.guildId) throw new Error('서버 채널에서만 음악을 사용할 수 있어요.');
	if (!ctx.member) throw new Error('DM에서는 음악을 제어할 수 없어요.');
	return port.actorFromMember(ctx.member);
}

export async function withAppError<T>(run: () => Promise<T>): Promise<T> {
	try {
		return await run();
	} catch (error) {
		if (error instanceof AppError) throw new Error(plainUserMessage(error), { cause: error });
		throw error;
	}
}
