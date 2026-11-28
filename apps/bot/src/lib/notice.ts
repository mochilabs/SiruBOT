import { createContainer } from '@sirubot/utils';

export function notice(message: string, accentColor?: number) {
	const container = createContainer().addTextDisplayComponents((text) => text.setContent(message));
	if (accentColor !== undefined) container.setAccentColor(accentColor);
	return container;
}
