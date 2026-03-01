import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';

export class TextChannelAllowed extends AllFlowsPrecondition {
	public override async messageRun(message: Message) {
		return this.checkChannel(message.guildId, message.channelId);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		return this.checkChannel(interaction.guildId, interaction.channelId);
	}

	public override async contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.checkChannel(interaction.guildId, interaction.channelId);
	}

	private async checkChannel(guildId: string | null, channelId: string | null) {
		if (!guildId || !channelId) return this.ok(); // DMs are handled by other preconditions if needed

		const guildSettings = await this.container.db.guild.findUnique({
			where: { id: guildId },
			select: { textChannelId: true }
		});

		// 1. 설정된 텍스트 채널이 없으면 통과
		if (!guildSettings?.textChannelId) return this.ok();

		const configuredChannelId = guildSettings.textChannelId;

		try {
			// 2. 설정된 텍스트 채널이 아직 존재하는지 캐시 또는 API로 확인
			const channelExists = await this.container.client.channels.fetch(configuredChannelId).catch(() => null);

			if (!channelExists) {
				// 채널이 삭제되었거나 봇이 볼 수 없는 경우: 설정을 초기화하고 통과시킴
				this.container.logger.info(`Configured text channel [${configuredChannelId}] is missing in guild [${guildId}]. Resetting config.`);
				await this.container.db.guild.update({
					where: { id: guildId },
					data: { textChannelId: null }
				});
				return this.ok();
			}

			// 3. 채널이 존재한다면, 명령어 사용 채널과 일치하는지 확인
			if (channelId !== configuredChannelId) {
				return this.error({
					message: `명령어는 <#${configuredChannelId}> 채널에서만 사용할 수 있어요.`
				});
			}

			return this.ok();
		} catch (error) {
			this.container.logger.error(`Error checking text channel for guild ${guildId}`, error);
			return this.ok(); // 에러 발생 시 일단 통과시켜서 명령어 사용 막히는 것 방지
		}
	}
}
