/**
 * 카운팅 채널 리스너 — 지정 채널에서 숫자를 순서대로 세요.
 *
 * - 규칙: 1부터 시작, 같은 사람이 연속으로 세면 실패(도배 방지), 틀리면 카운트가 초기화돼요.
 * - 상태는 Redis 해시(sirubot:counting:<guildId>)에 저장돼 재시작 뒤에도 이어져요.
 *   Redis 없는 개발 환경에서는 메모리 상태로만 동작해요 (재시작 시 초기화).
 * - 숫자가 아닌 메시지는 조용히 무시해요 — 카운팅 채널에서 잡담도 할 수 있어요.
 * - 판정 계약은 packages/utils/src/chatTools.ts (evaluateCounting).
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageFlags } from 'discord.js';
import { type CountingState, COUNTING_STATE_DEFAULT, emoji, evaluateCounting, parseCountingMessage } from '@sirubot/utils';

const COUNTING_KEY_PREFIX = 'sirubot:counting:';
/** 최고 기록 알림 기준 — 매 숫자마다 알리면 시끄러워요 */
const COUNTING_ANNOUNCE_MIN = 10;

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class CountingChannelListener extends Listener {
	/** 샤드 메모리 캐시 — 항상 최신 상태(길드는 샤드 하나에만 속해요), Redis는 재시작 복구용이에요 */
	private readonly memory = new Map<string, CountingState>();

	public override async run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			const settings = await this.container.guildService.getChatToolSettings(message.guildId);
			if (!settings.countingEnabled || !settings.countingChannelId) return;
			if (message.channelId !== settings.countingChannelId) return;

			const attempt = parseCountingMessage(message.content);
			if (attempt === null) return;

			const key = `${COUNTING_KEY_PREFIX}${message.guildId}`;
			const state = await this.loadState(message.guildId, key);
			const result = evaluateCounting(state, attempt, message.author.id);

			this.memory.set(message.guildId, result.state);
			await this.container.redisStore.setCacheHashFields(key, {
				current: String(result.state.current),
				lastUserId: result.state.lastUserId ?? '',
				best: String(result.state.best)
			});

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
			this.container.logger.error(`[countingChannel] unhandled error (guild ${message.guildId}): ${error}`);
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

	private async loadState(guildId: string, key: string): Promise<CountingState> {
		const cached = this.memory.get(guildId);
		if (cached) return cached;
		const fields = await this.container.redisStore.getCacheHashFields(key).catch(() => null);
		if (fields && fields.current !== undefined) {
			return {
				current: Number.parseInt(fields.current, 10) || 0,
				lastUserId: fields.lastUserId && fields.lastUserId.length > 0 ? fields.lastUserId : null,
				best: Number.parseInt(fields.best, 10) || 0
			};
		}
		return COUNTING_STATE_DEFAULT;
	}
}
