/**
 * 카운팅 채널 리스너 — 지정 채널에서 숫자를 순서대로 세요.
 *
 * - 규칙: 1부터 시작, 같은 사람이 연속으로 세면 실패(도배 방지), 틀리면 카운트가 초기화돼요.
 * - 상태는 services/countingState.ts가 관리해요 (Redis에 저장돼 재시작 뒤에도 이어져요).
 * - 같은 길드의 숫자 메시지는 도착 순서대로 하나씩 처리해요 — await 경계를 건너 뛴 같은 상태 읽기를 막아요.
 * - 숫자가 아닌 메시지는 조용히 무시해요 — 카운팅 채널에서 잡담도 할 수 있어요.
 * - 판정 계약은 packages/utils/src/chatTools.ts (evaluateCounting).
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import { emoji, enqueueOperation, evaluateCounting, parseCountingMessage } from '@sirubot/utils';
import { loadCountingState, saveCountingState } from '../../../../services/countingState.ts';

/** 최고 기록 알림 기준 — 매 숫자마다 알리면 시끄러워요 */
const COUNTING_ANNOUNCE_MIN = 10;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class CountingChannelListener extends Listener {
	/** 길드별 처리 직렬화 — 같은 길드 메시지만 순서대로, 다른 길드는 병렬 처리 (체인은 끝나면 스스로 정리돼요) */
	private readonly chains = new Map<string, Promise<void>>();

	public override async run(message: Message): Promise<void> {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		const guildId = message.guildId;
		// enqueue는 await 없이 동기로 — 도착 순서가 곧 처리 순서가 돼요
		await enqueueOperation(this.chains, guildId, () => this.processCounting(guildId, message));
	}

	private async processCounting(guildId: string, message: Message): Promise<void> {
		try {
			const settings = await this.container.guildService.getChatToolSettings(guildId);
			if (!settings.countingEnabled || !settings.countingChannelId) return;
			if (message.channelId !== settings.countingChannelId) return;

			const attempt = parseCountingMessage(message.content);
			if (attempt === null) return;

			const state = await loadCountingState(guildId);
			const result = evaluateCounting(state, attempt, message.author.id);
			saveCountingState(guildId, result.state);

			// 성공은 조용히 — 새 최고 기록만 알려줘요
			if (result.ok) {
				if (result.newBest && attempt >= COUNTING_ANNOUNCE_MIN) {
					await this.announce(message, `-# ${emoji('crown')} ${attempt}까지! 새 최고 기록이에요.`);
				}
				return;
			}

			// 이미 0이면 초기화할 것도 없어요 — 잡담처럼 조용히 넘겨요
			if (!result.reset) return;

			const reason = attempt === state.current + 1 ? '방금 센 분은 바로 이어서 셀 수 없어요!' : `${state.current + 1}부터 차례로 세야 해요!`;
			await this.announce(message, `-# ${emoji('warning')} ${reason} 다시 1부터 시작해요. (최고 기록 ${state.best})`);
		} catch (error) {
			this.container.logger.error(`[countingChannel] unhandled error (guild ${guildId}): ${error}`);
		}
	}

	private announce(message: Message, content: string): Promise<unknown> {
		return message
			.reply({
				content,
				flags: [MessageFlags.SuppressNotifications],
				allowedMentions: { parse: [] }
			})
			.catch(() => undefined);
	}
}
