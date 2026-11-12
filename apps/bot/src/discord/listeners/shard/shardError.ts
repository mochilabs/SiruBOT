import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import * as Sentry from '@sentry/node';

/**
 * 게이트웨이(shard) 오류 — 로그만 남기면 재연결 폭풍·인증 실패가 조용히 지나가요.
 * 같은 사유가 반복되면 Sentry에서 묶이도록 shard 별로 태그를 걸고, 이벤트로 올려요.
 */
@ApplyOptions<Listener.Options>({
	event: 'shardError'
})
export class ShardErrorEvent extends Listener {
	public override run(error: Error, id: number) {
		this.container.logger.error(`Shard ${id} error:`, error);

		Sentry.withScope((scope) => {
			scope.setTag('type', 'shardError');
			scope.setTag('shard_id', String(id));
			Sentry.captureException(error);
		});
	}
}
