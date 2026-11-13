import { createContainer } from '@sirubot/utils';
import { SeparatorBuilder, SeparatorSpacingSize } from 'discord.js';

export function pingView(lines: string[], deferOverhead: number) {
	return createContainer()
		.addTextDisplayComponents((t) => t.setContent(lines.join('\n')))
		.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small))
		.addTextDisplayComponents((t) => t.setContent(`-# 처리 시작 ~ 응답 전송까지 \`${deferOverhead}ms\``));
}
