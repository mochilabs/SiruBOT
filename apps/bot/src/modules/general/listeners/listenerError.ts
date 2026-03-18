import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerErrorPayload } from '@sapphire/framework';
import * as Sentry from '@sentry/node';

@ApplyOptions<Listener.Options>({ event: Events.ListenerError })
export class ListenerError extends Listener {
	public override run(error: Error, { piece }: ListenerErrorPayload) {
		Sentry.withScope((scope) => {
			scope.setTag('listener', piece.name);
			scope.setTag('type', 'listenerError');
			scope.setTag('event', piece.event.toString());
			Sentry.captureException(error);
		});

		this.container.logger.error(`ListenerError in ${piece.name}:`, error);
	}
}
