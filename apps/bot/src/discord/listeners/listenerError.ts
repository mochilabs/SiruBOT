import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, ListenerErrorPayload, UserError } from '@sapphire/framework';
import * as Sentry from '@sentry/node';

// Sapphire 기본 CoreListenerError를 같은 이름으로 대체해 같은 오류가 두 번 남지 않게 해요.
@ApplyOptions<Listener.Options>({ name: 'CoreListenerError', event: Events.ListenerError })
export class ListenerError extends Listener {
	public override run(error: Error, { piece }: ListenerErrorPayload) {
		if (!(error instanceof UserError)) {
			Sentry.withScope((scope) => {
				scope.setTag('listener', piece.name);
				scope.setTag('type', 'listenerError');
				scope.setTag('event', piece.event.toString());
				Sentry.captureException(error);
			});
			this.container.logger.error(`ListenerError in ${piece.name}:`, error);
			return;
		}
		this.container.logger.warn(`ListenerError (UserError: ${error.identifier}) in ${piece.name}`);
	}
}
