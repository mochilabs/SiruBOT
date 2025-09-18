import { ApplyOptions } from '@sapphire/decorators';
import { ChatInputCommandErrorPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { buildErrorEmbed, DEFAULT_COLOR } from '@sirubot/utils';
import { EmbedBuilder, MessageFlags } from 'discord.js';

@ApplyOptions<Listener.Options>({ event: Events.ChatInputCommandError })
export class ChatInputCommandError extends Listener {
	public override async run(error: Error, { interaction }: ChatInputCommandErrorPayload) {
		// `context: { silent: true }` should make UserError silent:
		// Use cases for this are for example permissions error when running the `eval` command.
		// if (Reflect.get(Object(error), 'silent')) return;
		const sendEmbed = async (embed: EmbedBuilder) => {
			if (interaction.deferred || interaction.replied) {
				await interaction.editReply({
					embeds: [embed],
					allowedMentions: { users: [interaction.user.id], roles: [] }
				});

				return;
			}

			await interaction.reply({
				embeds: [embed],
				allowedMentions: { users: [interaction.user.id], roles: [] },
				flags: [MessageFlags.Ephemeral]
			});
		};

		if (error instanceof UserError) {
			await sendEmbed(new EmbedBuilder().setColor(DEFAULT_COLOR).setDescription(error.message));
		} else {
			await sendEmbed(buildErrorEmbed(error.message).setFooter().setTimestamp().setTitle('명령어를 실행하는 도중 오류가 발생했어요'));
		}

		return;
	}
}
