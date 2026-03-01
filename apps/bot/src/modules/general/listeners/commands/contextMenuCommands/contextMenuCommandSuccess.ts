import { type ContextMenuCommandSuccessPayload, Listener } from '@sapphire/framework';
import { logSuccessCommand } from '../chatInputCommands/chatInputCommandSuccess.ts';

export class UserListener extends Listener {
	public override run(payload: ContextMenuCommandSuccessPayload) {
		logSuccessCommand(payload);
	}

	public override onLoad() {
		// this.enabled = (this.container.logger as Logger).level <= LogLevel.Debug;
		return super.onLoad();
	}
}
