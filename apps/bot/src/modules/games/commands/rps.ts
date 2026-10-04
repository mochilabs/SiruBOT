import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { createContainer } from '@sirubot/utils';
import { ActionRowBuilder, ApplicationIntegrationType, ButtonBuilder, ButtonStyle, ChatInputCommandInteraction, MessageFlags } from 'discord.js';

const RPS_LABELS = ['가위 ✌️', '바위 ✊', '보 🖐'];

function choiceContainer(displayName: string) {
	const container = createContainer();
	container.addTextDisplayComponents((t) =>
		t.setContent(`### ✊ 가위바위보\n\n**${displayName}** 님, 무엇을 낼까요?\n\n-# 가위✌️ · 바위✊ · 보🖐 버튼을 눌러주세요. 결과는 나만 보여요.`)
	);
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId('game:rps:0').setLabel('가위 ✌️').setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId('game:rps:1').setLabel('바위 ✊').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId('game:rps:2').setLabel('보 🖐').setStyle(ButtonStyle.Danger)
		)
	);
	return container;
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'rps',
	description: '가위바위보로 봇과 승부해요.',
	fullCategory: ['게임']
})
export class RpsCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '가위바위보' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '가위바위보로 봇과 승부해요.' });
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		await interaction.reply({
			components: [choiceContainer(interaction.user.displayName)],
			flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
		});
	}
}

export { choiceContainer as rpsChoiceContainer, RPS_LABELS as rpsLabels };
