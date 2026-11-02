import { createContainer } from '@sirubot/utils';

export function notice(message: string) {
	return createContainer().addTextDisplayComponents((text) => text.setContent(message));
}
