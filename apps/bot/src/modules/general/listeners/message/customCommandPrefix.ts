/**
 * 커스텀 명령어 접두사 리스너 — "접두사 + 이름" 메시지로 길드 커스텀 명령어를 실행해요.
 *
 * 예전 봇 느낌의 메시지 트리거예요 (슬래시 등록 없음 — 이름 개수 제한이 없어요).
 * - 접두사는 길드별 설정(기본 '!'), !도움말은 예약어로 커스텀 명령어 목록을 보여줘요.
 * - 등록되지 않은 이름이면 조용히 무시해요 — 다른 봇의 접두사·일반 채팅과 충돌하지 않아요.
 * - 유저당 3초 쿨다운으로 스팸 연타를 막아요.
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ContainerBuilder, Message, MessageCreateOptions, MessageFlags, PermissionFlagsBits, TextDisplayBuilder } from 'discord.js';
import {
	CUSTOM_COMMAND_MAX_ARGS,
	CUSTOM_COMMAND_RESERVED_NAMES,
	DEFAULT_COLOR,
	MemoryCache,
	emoji,
	normalizeCustomCommandName
} from '@sirubot/utils';

import { runCustomCommandSpec, type CustomCommandContext } from '../../../../services/customCommands/interpreter.ts';
import { findCustomCommand, getGuildCustomCommands } from '../../../../services/customCommands/store.ts';

/** 유저별 실행 쿨다운 (ms) — 길드+유저 키 */
const EXECUTE_COOLDOWN_MS = 3_000;

/** 이름 토큰 뒤의 나머지 문자열 → 인수 배열 ({argv0}~ 치환용, 최대 5개) */
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

	public override async run(message: Message) {
		if (message.author.bot || !message.inGuild()) return;
		if (!message.channel.isSendable()) return;

		// 접두사 자체가 길드 설정이라 캐시에서 빠르게 읽혀요 (DB 미스는 여기서만 일어나요)
		const prefix = await this.container.guildService.getCustomCommandPrefix(message.guildId).catch(() => null);
		if (!prefix || !message.content.startsWith(prefix)) return;

		const rest = message.content.slice(prefix.length).trimStart();
		if (!rest) return;
		const firstTokenEnd = rest.search(/\s/u);
		const name = normalizeCustomCommandName(firstTokenEnd === -1 ? rest : rest.slice(0, firstTokenEnd));
		if (!name) return;

		// 유저 쿨다운 — 도움말·실행 모두에 적용해요
		const cooldownKey = `${message.guildId}:${message.author.id}`;
		if (this.cooldowns.has(cooldownKey)) {
			await message
				.reply({
					content: `-# ${emoji('hourglass')} 잠시 후 다시 시도해 주세요.`,
					flags: [MessageFlags.SuppressNotifications],
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

		const entry = await findCustomCommand(message.guildId, name);
		if (!entry || entry.method !== 'prefix') return; // 등록되지 않은 이름·슬래시형 — 조용히 무시

		const member = message.member;
		if (!member) return;
		const me = message.guild.members.me;
		const args = parseCustomCommandArgs(firstTokenEnd === -1 ? '' : rest.slice(firstTokenEnd));
		const ctx: CustomCommandContext = {
			channel: { send: (payload) => message.channel.send(payload as MessageCreateOptions) },
			member: {
				id: member.id,
				permissions: 'permissionsFor' in message.channel ? (message.channel.permissionsFor(member)?.bitfield ?? 0n) : 0n,
				hasRole: (roleId) => member.roles.cache.has(roleId),
				addRole: (roleId) => member.roles.add(roleId),
				removeRole: (roleId) => member.roles.remove(roleId)
			},
			guild: {
				botTopRolePosition: me?.roles.highest.position ?? 0,
				botCanManageRoles: me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false,
				getRole: (roleId) => {
					const role = message.guild.roles.cache.get(roleId);
					return role ? { id: role.id, position: role.position, managed: role.managed } : null;
				}
			},
			channelId: message.channel.id,
			args,
			triggerMessage: {
				react: (emojiInput) => message.react(emojiInput),
				pin: () => message.pin(),
				delete: () => message.delete()
			}
		};

		const result = await runCustomCommandSpec(entry.spec, ctx);
		if (result.kind === 'invalid_spec') {
			await message
				.reply({
					content: `-# ${emoji('error')} \`${prefix}${entry.name}\` 명령어 정의가 올바르지 않아요. 서버 관리자가 대시보드에서 다시 저장해 주세요.`,
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}
		if (result.kind === 'access_denied') {
			await message
				.reply({
					content: `-# ${emoji('error')} 이 명령어를 실행할 권한이 없어요.`,
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
			return;
		}
		if (result.kind === 'action_failed') {
			this.container.logger.warn(
				`[customCommands] 실행 실패 (${message.guildId}/${entry.name}, 스텝 ${result.stepIndex}, ${result.sent}개 전송 후): ${result.reason}`
			);
			await message
				.reply({
					content: `-# ${emoji('error')} 명령어 실행에 실패했어요: ${result.reason}`,
					flags: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		}
	}

	/** !도움말 — 이 길드의 커스텀 명령어 목록 (Components V2 컨테이너) */
	private async sendList(message: Message, prefix: string, guildId: string) {
		const commands = await getGuildCustomCommands(guildId);
		const container = new ContainerBuilder().setAccentColor(DEFAULT_COLOR);
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent('## 커스텀 명령어'));

		if (commands.ordered.length === 0) {
			container.addTextDisplayComponents(
				new TextDisplayBuilder().setContent('아직 등록된 커스텀 명령어가 없어요.\n-# 서버 관리자가 대시보드에서 만들 수 있어요.')
			);
		} else {
			const lines = commands.ordered
				.filter((command) => command.method === 'prefix')
				.map((command) => `\`${prefix}${command.name}\` — ${command.description || '설명 없음'}`);
			if (lines.length === 0) {
				container.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(
						'이 서버의 커스텀 명령어는 슬래시로 등록되어 있어요.\n-# 슬래시 명령어 목록에서 확인해 주세요.'
					)
				);
			} else {
				container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
			}
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# 생성·수정·삭제는 대시보드에서 관리해요.'));
		}

		await message
			.reply({
				components: [container],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
				allowedMentions: { parse: [] }
			})
			.catch((error: unknown) =>
				this.container.logger.warn(`[customCommands] 도움말 목록 전송 실패: ${error instanceof Error ? error.message : String(error)}`)
			);
	}
}
