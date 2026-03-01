import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandErrorPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { DEFAULT_COLOR, WARN_COLOR } from '@sirubot/utils';
import { ContainerBuilder } from 'discord.js';
import { sendComponent } from './chatInputCommandDenied.ts';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandError extends Listener {
	public override async run(error: Error, { interaction }: ChatInputCommandErrorPayload) {
		const userError = error instanceof UserError;
		await sendComponent(
			interaction,
			new ContainerBuilder()
				.setAccentColor(userError ? DEFAULT_COLOR : WARN_COLOR)
				.addTextDisplayComponents((textDisplay) =>
					textDisplay.setContent(!userError ? '명령어를 실행하는 도중 오류가 발생했어요\n' + error.message : error.message)
				)
		);
	}
}
