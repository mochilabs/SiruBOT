import { createContainer } from '@sirubot/utils';

export function textContainer(lines: string[]) {
	return createContainer().addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
}
