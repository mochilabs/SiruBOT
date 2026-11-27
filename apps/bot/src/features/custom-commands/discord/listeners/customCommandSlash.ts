import { notice as noticeView } from '../../../../lib/notice.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener, container } from '@sapphire/framework';
import { MessageFlags, type ChatInputCommandInteraction, type Interaction, type MessageCreateOptions } from 'discord.js';
import { CUSTOM_COMMAND_MAX_ARGS, emoji, normalizeCustomCommandName } from '@sirubot/utils';

import { buildCustomCommandGuildContext, buildCustomCommandMemberContext, customCommandNotice } from '../../application/context.ts';
import { runCustomCommandSpec, type CustomCommandContext } from '../../application/interpreter.ts';
import { customCommandDesignView } from '../views/customCommand.ts';
import { moduleDisabledMessage, usageFeatureKey } from '@sirubot/utils/modules';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';

export async function handleCustomCommandSlashInteraction(interaction: ChatInputCommandInteraction): Promise<boolean> {
	if (!interaction.inGuild()) return false;
	const guild = interaction.guild;
	if (!guild) return false;
	const entry = await container.customCommandStore.findCustomCommand(interaction.guildId, normalizeCustomCommandName(interaction.commandName));
	if (!entry || entry.method !== 'slash') return false;

	if (!(await isMessageFeatureEnabled(container.guildService, interaction.guildId, 'custom-command'))) {
		await interaction.reply({
			components: [noticeView(moduleDisabledMessage('community'))],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
			allowedMentions: { parse: [] }
		});
		return true;
	}

	await interaction.deferReply();

	const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
	if (!member) {
		await interaction
			.editReply({
				components: [noticeView(`-# ${emoji('error')} 실행자를 찾지 못했어요. 잠시 후 다시 시도해 주세요.`)],
				flags: [MessageFlags.IsComponentsV2]
			})
			.catch(() => undefined);
		return true;
	}
	const me = guild.members.me;

	let replied = false;
	const notify = async (text: string): Promise<void> => {
		const payload = { components: [noticeView(text)], flags: MessageFlags.IsComponentsV2 as const, allowedMentions: { parse: [] } };
		if (replied) await interaction.channel?.send(payload).catch(() => undefined);
		else await interaction.editReply(payload).catch(() => undefined);
	};

	const args = Array.from({ length: CUSTOM_COMMAND_MAX_ARGS }, (_unused, index) => interaction.options.getString(`argument${index + 1}`) ?? '');
	const ctx: CustomCommandContext = {
		channel: {
			send: async (payload) => {
				if (!replied) {
					replied = true;
					return interaction.editReply(payload as Parameters<typeof interaction.editReply>[0]);
				}
				if (!interaction.channel) throw new Error('채널을 찾을 수 없어요');
				return interaction.channel.send(payload as MessageCreateOptions);
			}
		},
		member: buildCustomCommandMemberContext(member, interaction.memberPermissions?.bitfield ?? 0n),
		guild: buildCustomCommandGuildContext(guild, me),
		channelId: interaction.channelId,
		args,
		renderDesign: customCommandDesignView,
		triggerMessage: {
			react: async (emojiInput) => (await interaction.fetchReply()).react(emojiInput),
			pin: async () => (await interaction.fetchReply()).pin(),
			delete: async () => interaction.deleteReply()
		}
	};

	container.usageRecorder?.record(interaction.guildId, usageFeatureKey('msg', 'custom-command'), interaction.user.id);
	const result = await runCustomCommandSpec(entry.spec, ctx);
	const notice = customCommandNotice(result, `\`/${entry.name}\``);
	if (notice) await notify(notice);
	else if (!replied)
		await interaction.editReply({ components: [noticeView('처리했어요.')], flags: [MessageFlags.IsComponentsV2] }).catch(() => undefined);
	return true;
}

@ApplyOptions<Listener.Options>({
	event: Events.InteractionCreate
})
export class CustomCommandSlashListener extends Listener {
	public override async run(interaction: Interaction) {
		if (!interaction.isChatInputCommand()) return;
		await handleCustomCommandSlashInteraction(interaction).catch((error: unknown) => {
			this.container.logger.warn(`[customCommands] 슬래시 실행 오류: ${error instanceof Error ? error.message : String(error)}`);
		});
	}
}
