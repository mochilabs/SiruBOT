/**
 * 커스텀 슬래시 명령어 실행 핸들러 — 길드에 등록된 슬래시형 커스텀 명령어 인터랙션을 실행해요.
 *
 * - slashRegistry가 길드 커맨드로 등록한 이름이 인터랙션으로 오면, 같은 인터프리터 엔진에
 *   interaction을 컨텍스트로 바꿔 넘겨요 (접두사 실행과 계약 동일 — access·역할 위계 재검증 포함).
 * - 슬래시는 3초 안에 응답해야 하므로 deferReply로 먼저 받고, 첫 메시지는 그 응답을 수정해 나가요.
 *   이후 메시지는 채널로 전송해요. 보낼 메시지가 전혀 없으면 '처리했어요' 한 줄로 마무리해요.
 * - delete_trigger는 응답 삭제(deleteReply)로 동작해요.
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import type { ChatInputCommandInteraction, Interaction, MessageCreateOptions } from 'discord.js';
import { PermissionFlagsBits } from 'discord.js';
import { CUSTOM_COMMAND_MAX_ARGS, emoji, normalizeCustomCommandName } from '@sirubot/utils';

import { runCustomCommandSpec, type CustomCommandContext } from '../../../../services/customCommands/interpreter.ts';
import { findCustomCommand } from '../../../../services/customCommands/store.ts';

/** 인터랙션 1건을 처리해요. 이 봇의 슬래시형 커스텀 명령어가 아니면 false를 돌려줘요. */
export async function handleCustomCommandSlashInteraction(interaction: ChatInputCommandInteraction): Promise<boolean> {
	if (!interaction.inGuild()) return false;
	const guild = interaction.guild;
	if (!guild) return false;
	const entry = await findCustomCommand(interaction.guildId, normalizeCustomCommandName(interaction.commandName));
	if (!entry || entry.method !== 'slash') return false;

	await interaction.deferReply();

	const member = guild.members.cache.get(interaction.user.id) ?? (await guild.members.fetch(interaction.user.id).catch(() => null));
	if (!member) {
		await interaction.editReply(`-# ${emoji('error')} 실행자를 찾지 못했어요. 잠시 후 다시 시도해 주세요.`).catch(() => undefined);
		return true;
	}
	const me = guild.members.me;

	let replied = false;
	const notify = async (text: string): Promise<void> => {
		if (replied) await interaction.channel?.send({ content: text, allowedMentions: { parse: [] } }).catch(() => undefined);
		else await interaction.editReply(text).catch(() => undefined);
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
		member: {
			id: member.id,
			permissions: interaction.memberPermissions?.bitfield ?? 0n,
			hasRole: (roleId) => member.roles.cache.has(roleId),
			addRole: (roleId) => member.roles.add(roleId),
			removeRole: (roleId) => member.roles.remove(roleId)
		},
		guild: {
			botTopRolePosition: me?.roles.highest.position ?? 0,
			botCanManageRoles: me?.permissions.has(PermissionFlagsBits.ManageRoles) ?? false,
			getRole: (roleId) => {
				const role = guild.roles.cache.get(roleId);
				return role ? { id: role.id, position: role.position, managed: role.managed } : null;
			}
		},
		channelId: interaction.channelId,
		args,
		triggerMessage: {
			react: async (emojiInput) => (await interaction.fetchReply()).react(emojiInput),
			pin: async () => (await interaction.fetchReply()).pin(),
			delete: async () => interaction.deleteReply()
		}
	};

	const result = await runCustomCommandSpec(entry.spec, ctx);
	switch (result.kind) {
		case 'invalid_spec':
			await notify(`-# ${emoji('error')} \`/${entry.name}\` 명령어 정의가 올바르지 않아요. 서버 관리자가 대시보드에서 다시 저장해 주세요.`);
			break;
		case 'access_denied':
			await notify(`-# ${emoji('error')} 이 명령어를 실행할 권한이 없어요.`);
			break;
		case 'action_failed':
			await notify(`-# ${emoji('error')} 명령어 실행에 실패했어요: ${result.reason}`);
			break;
		case 'ok':
			if (!replied) await interaction.editReply('처리했어요.').catch(() => undefined);
			break;
	}
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
