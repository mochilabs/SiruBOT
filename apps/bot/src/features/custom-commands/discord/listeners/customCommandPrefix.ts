import { notice as noticeView } from '../../../../lib/notice.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { Message, MessageCreateOptions, MessageFlags } from 'discord.js';
import { customCommandDesignView, customCommandListView } from '../views/customCommand.ts';
import { CUSTOM_COMMAND_MAX_ARGS, CUSTOM_COMMAND_RESERVED_NAMES, MemoryCache, emoji, normalizeCustomCommandName } from '@sirubot/utils';

import { buildCustomCommandGuildContext, buildCustomCommandMemberContext, customCommandNotice } from '../../application/context.ts';
import { runCustomCommandSpec, type CustomCommandContext } from '../../application/interpreter.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';
import { inGuildTheme } from '../../../../lib/guildThemeScope.ts';

const EXECUTE_COOLDOWN_MS = 3_000;

export function parseCustomCommandArgs(rest: string): string[] {
	const trimmed = rest.trim();
	if (!trimmed) return [];
	return trimmed.split(/\s+/u).slice(0, CUSTOM_COMMAND_MAX_ARGS);
}

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class CustomCommandPrefixListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: EXECUTE_COOLDOWN_MS, maxSize: 5_000 });

	public override run(message: Message) {
		if (message.author.bot || !message.inGuild()) return Promise.resolve();
		return inGuildTheme(message.guildId, () => this.handle(message));
	}

	private async handle(message: Message) {
		if (message.author.bot || !message.inGuild()) return;
		if (!message.channel.isSendable()) return;
		if (!(await isMessageFeatureEnabled(this.container.guildService, message.guildId, 'custom-command'))) return;

		const prefix = await guildChatPolicy.getCustomCommandPrefix(this.container.guildService, message.guildId).catch(() => null);
		if (!prefix || !message.content.startsWith(prefix)) return;

		const rest = message.content.slice(prefix.length).trimStart();
		if (!rest) return;
		const firstTokenEnd = rest.search(/\s/u);
		const name = normalizeCustomCommandName(firstTokenEnd === -1 ? rest : rest.slice(0, firstTokenEnd));
		if (!name) return;

		const cooldownKey = `${message.guildId}:${message.author.id}`;
		if (this.cooldowns.has(cooldownKey)) {
			await message
				.reply({
					components: [noticeView(`-# ${emoji('hourglass')} 잠시 후 다시 시도해 주세요.`)],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}
		this.cooldowns.set(cooldownKey, true);

		if (CUSTOM_COMMAND_RESERVED_NAMES.some((reserved) => reserved === name)) {
			await this.sendList(message, prefix, message.guildId);
			return;
		}

		const entry = await this.container.customCommandStore.findCustomCommand(message.guildId, name);
		if (!entry || entry.method !== 'prefix') return; // 등록되지 않은 이름·슬래시형 — 조용히 무시
		// 사용 지표: 서버마다 이름이 달라서 커스텀 명령은 하나로 묶어요
		this.container.usageRecorder?.record(message.guildId, usageFeatureKey('msg', 'custom-command'), message.author.id);

		const member = message.member;
		if (!member) return;
		const me = message.guild.members.me;
		const args = parseCustomCommandArgs(firstTokenEnd === -1 ? '' : rest.slice(firstTokenEnd));
		const ctx: CustomCommandContext = {
			channel: { send: (payload) => message.channel.send(payload as MessageCreateOptions) },
			member: buildCustomCommandMemberContext(
				member,
				'permissionsFor' in message.channel ? (message.channel.permissionsFor(member)?.bitfield ?? 0n) : 0n
			),
			guild: buildCustomCommandGuildContext(message.guild, me),
			channelId: message.channel.id,
			args,
			renderDesign: customCommandDesignView,
			triggerMessage: {
				react: (emojiInput) => message.react(emojiInput),
				pin: () => message.pin(),
				delete: () => message.delete()
			}
		};

		const result = await runCustomCommandSpec(entry.spec, ctx);
		if (result.kind === 'action_failed') {
			this.container.logger.warn(
				`[customCommands] 실행 실패 (${message.guildId}/${entry.name}, 스텝 ${result.stepIndex}, ${result.sent}개 전송 후): ${result.reason}`
			);
		}
		const notice = customCommandNotice(result, `\`${prefix}${entry.name}\``);
		if (notice) {
			await message
				.reply({
					components: [noticeView(notice)],
					flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		}
	}

	private async sendList(message: Message, prefix: string, guildId: string) {
		const commands = await this.container.customCommandStore.getGuildCustomCommands(guildId);
		const lines = commands.ordered
			.filter((command) => command.method === 'prefix')
			.map((command) => `\`${prefix}${command.name}\` · ${command.description || '설명 없음'}`);

		await message
			.reply({
				components: [customCommandListView({ hasCommands: commands.ordered.length > 0 }, lines)],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
				allowedMentions: { parse: [] }
			})
			.catch((error: unknown) =>
				this.container.logger.warn(`[customCommands] 도움말 목록 전송 실패: ${error instanceof Error ? error.message : String(error)}`)
			);
	}
}
