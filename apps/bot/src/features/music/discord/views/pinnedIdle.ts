import { createContainer, emoji } from '@sirubot/utils';
import { TextDisplayBuilder } from 'discord.js';

/** 고정 채널 상시 패널의 대기 화면 — 재생이 없을 때 컨트롤러 메시지를 이 모습으로 되돌려요. */
export function pinnedIdleView() {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			[
				`### ${emoji('pin')} 재생 중인 곡이 없어요`,
				'이 채널에 **곡 제목이나 링크**를 입력하면 바로 재생해요.',
				'-# 재생이 시작되면 이 메시지가 지금 재생 중인 곡으로 바뀌어요.'
			].join('\n')
		)
	);
}
