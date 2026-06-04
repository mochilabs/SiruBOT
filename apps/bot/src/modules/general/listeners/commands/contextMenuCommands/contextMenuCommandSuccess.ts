import { type ContextMenuCommandSuccessPayload, Listener } from '@sapphire/framework';
import { logSuccessCommand } from '../chatInputCommands/chatInputCommandSuccess.ts';

export class UserListener extends Listener {
	public override run(payload: ContextMenuCommandSuccessPayload) {
		logSuccessCommand(payload);
	}

	public override onLoad() {
		return super.onLoad();
	}
}
