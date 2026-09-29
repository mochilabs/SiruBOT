import { ActionRowBuilder, StringSelectMenuBuilder, type ContainerBuilder } from 'discord.js';
import { createContainer } from '@sirubot/utils';

export interface PollState {
	guildId: string;
	channelId: string;
	messageId: string;
	editMessage: (components: ContainerBuilder[]) => Promise<void>;
	question: string;
	options: string[];
	votes: Map<string, number>;
	endsAt: number | null;
	closed: boolean;
	timer: NodeJS.Timeout | null;
}

export const polls = new Map<string, PollState>();

function pollLines(poll: PollState): string[] {
	const total = poll.votes.size;
	const lines = [`### 📊 ${poll.question}`, ''];

	poll.options.forEach((option, index) => {
		const count = [...poll.votes.values()].filter((v) => v === index).length;
		const pct = total > 0 ? Math.round((count / total) * 100) : 0;
		lines.push(`**${index + 1}.** ${option} — **${count}표** (${pct}%)`);
	});

	const status = poll.closed ? '🔒 마감됨' : poll.endsAt ? `⏱️ <t:${Math.floor(poll.endsAt / 1000)}:R> 마감` : '무기한';
	lines.push('', `-# 총 **${total}명** 참여 · ${status}`);
	return lines;
}

function pollSelect(poll: PollState, pollId: string): StringSelectMenuBuilder {
	return new StringSelectMenuBuilder()
		.setCustomId(`game:poll:${pollId}`)
		.setPlaceholder(poll.closed ? '마감된 투표예요' : '선택지를 고르거나 선택을 바꿔보세요')
		.setDisabled(poll.closed)
		.addOptions(poll.options.slice(0, 25).map((option, index) => ({ label: option.slice(0, 100), value: String(index) })));
}

export function renderPollContainer(poll: PollState, pollId: string) {
	const container = createContainer();
	container.addTextDisplayComponents((t) => t.setContent(pollLines(poll).join('\n')));
	container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(pollSelect(poll, pollId)));
	return container;
}

export async function closePoll(pollId: string): Promise<void> {
	const poll = polls.get(pollId);
	if (!poll) return;

	if (poll.timer) clearTimeout(poll.timer);
	poll.timer = null;
	poll.closed = true;

	try {
		await poll.editMessage([renderPollContainer(poll, pollId)]);
	} catch {
		// 메시지가 삭제됐거나 채널이 사라진 경우 — 조용히 정리한다.
	} finally {
		polls.delete(pollId);
	}
}
