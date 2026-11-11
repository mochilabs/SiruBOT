import { emoji } from '@sirubot/utils';
import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { evalId } from '../customIds.ts';
import { notice } from './notice.ts';

/** 코드 입력 모달 — customId `eval:v1:modal` / `eval:v1:code`는 evalModal 핸들러가 파싱해요 */
export function evalModal() {
	const codeInput = new TextInputBuilder()
		.setCustomId(evalId.encode('code'))
		.setLabel('실행할 코드')
		.setStyle(TextInputStyle.Paragraph)
		.setPlaceholder('this.container.client.guilds.cache.size')
		.setRequired(true);
	return new ModalBuilder()
		.setCustomId(evalId.encode('modal'))
		.setTitle('코드 실행')
		.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(codeInput));
}

export function evalResultView(code: string, result: string, success: boolean) {
	return notice(
		`### ${success ? emoji('success') : emoji('error')} Eval\n**Input:**\n\`\`\`js\n${code}\n\`\`\`\n**Output:**\n\`\`\`js\n${result}\n\`\`\``
	);
}
