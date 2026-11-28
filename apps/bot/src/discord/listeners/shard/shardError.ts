import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import * as Sentry from '@sentry/node';

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
