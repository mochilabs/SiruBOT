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

		// 길드 설정은 GuildService의 60초 TTL 캐시를 재사용 — 매 명령어마다 DB 조회 방지
		const configuredChannelId = await this.container.guildService.getDefaultTextChannel(guildId);

		// 1. 설정된 텍스트 채널이 없으면 통과
		if (!configuredChannelId) return this.ok();

		try {
			// 2. 설정된 텍스트 채널이 아직 존재하는지 확인 — 캐시 먼저, 없으면 API로
			// fetch 실패를 모두 "채널 삭제"로 간주하지 않음: Unknown Channel(10003)일 때만 설정 초기화
			const channelExists =
				this.container.client.channels.cache.get(configuredChannelId) ??
				(await this.container.client.channels.fetch(configuredChannelId).catch((error: any) => {
					if (error?.code === 10003 || error?.rawError?.code === 10003) return null;
					this.container.logger.warn(
						`Transient failure fetching configured text channel [${configuredChannelId}] in guild [${guildId}]: ${error?.message ?? error}`
					);
					return 'transient' as const;
				}));

			if (channelExists === 'transient') return this.ok();

			if (!channelExists) {
				// 채널이 삭제되었거나 봇이 볼 수 없는 경우: 설정을 초기화하고 통과시킴
				this.container.logger.info(`Configured text channel [${configuredChannelId}] is missing in guild [${guildId}]. Resetting config.`);
				await this.container.guildService.setDefaultTextChannel(guildId, null);
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
