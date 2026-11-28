import { notice } from '../../../../lib/notice.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import { emoji, enqueueOperation, evaluateCounting, parseCountingMessage } from '@sirubot/utils';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { inGuildTheme } from '../../../../lib/guildThemeScope.ts';

const COUNTING_ANNOUNCE_MIN = 10;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class CountingChannelListener extends Listener {
	private readonly chains = new Map<string, Promise<void>>();

	public override async run(message: Message): Promise<void> {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		const guildId = message.guildId;
		// enqueue는 await 없이 동기로 호출해 도착 순서대로 직렬화해요
		await enqueueOperation(this.chains, guildId, () => this.processCounting(guildId, message));
	}

	private async processCounting(guildId: string, message: Message): Promise<void> {
		try {
			if (!(await isMessageFeatureEnabled(this.container.guildService, guildId, 'counting'))) return;
			const settings = await guildChatPolicy.getChatToolSettings(this.container.guildService, guildId);
			if (!settings.countingEnabled || !settings.countingChannelId) return;
			if (message.channelId !== settings.countingChannelId) return;

			const attempt = parseCountingMessage(message.content);
			if (attempt === null) return;

			this.container.usageRecorder?.record(guildId, usageFeatureKey('msg', 'counting'), message.author.id);
			const state = await this.container.countingState.load(guildId);
			if (!state) return;
			const result = evaluateCounting(state, attempt, message.author.id);
			this.container.countingState.save(guildId, result.state);

			if (result.ok) {
				if (result.newBest && attempt >= COUNTING_ANNOUNCE_MIN) {
					await this.announce(message, () => `-# ${emoji('crown')} ${attempt}까지! 새 최고 기록이에요.`);
				}
				return;
			}

			if (!result.reset) return;

			const reason = attempt === state.current + 1 ? '방금 센 분은 바로 이어서 셀 수 없어요!' : `${state.current + 1}부터 차례로 세야 해요!`;
			await this.announce(message, () => `-# ${emoji('warning')} ${reason} 다시 1부터 시작해요. (최고 기록 ${state.best})`);
		} catch (error) {
			this.container.logger.error(`[countingChannel] unhandled error (guild ${guildId}): ${error}`);
		}
	}

	private async announce(message: Message, buildContent: () => string): Promise<unknown> {
		const components = [await inGuildTheme(message.guildId, () => notice(buildContent()))];
		return message
			.reply({
				components,
				flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
				allowedMentions: { parse: [] }
			})
			.catch(() => undefined);
	}
}
