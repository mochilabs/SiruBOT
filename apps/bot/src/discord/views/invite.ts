import { emoji, createContainer, BOT_NAME } from '@sirubot/utils';
import { ButtonStyle } from 'discord.js';

export function inviteView(avatarUrl: string, inviteUrl: string) {
	return createContainer().addSectionComponents((s) =>
		s
			.addTextDisplayComponents((t) => t.setContent(`### ${emoji('link')} ${BOT_NAME} 초대\n\n아래 버튼을 눌러 봇을 서버에 초대하세요!`))
			.setThumbnailAccessory((t) => t.setURL(avatarUrl))
			.setButtonAccessory((b) => b.setLabel('초대하기').setStyle(ButtonStyle.Link).setURL(inviteUrl))
	);
}
