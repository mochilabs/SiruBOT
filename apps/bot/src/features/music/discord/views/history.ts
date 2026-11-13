import { emoji, createContainer } from '@sirubot/utils';

export function historyView(lines: string[]) {
	return createContainer().addTextDisplayComponents((text) => text.setContent(`### ${emoji('scroll')} 최근 재생 기록\n\n${lines.join('\n')}`));
}
