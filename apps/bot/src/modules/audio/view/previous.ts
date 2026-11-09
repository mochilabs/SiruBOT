import { emoji, createContainer } from '@sirubot/utils';

export function previousReplayed(title: string) {
	return createContainer().addTextDisplayComponents((text) => text.setContent(`${emoji('arrow_back')} 이전곡 **${title}**을(를) 다시 재생해요.`));
}
