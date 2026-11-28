import { MessageFlags } from 'discord.js';
import {
	CUSTOM_COMMAND_MAX_ARGS,
	customCommandSpecSchema,
	type CustomCommandAccess,
	type CustomCommandDesign,
	type CustomCommandStep
} from '@sirubot/utils';
import { sleep } from '@sirubot/utils/time';

export interface CustomCommandSendPayload {
	content?: string;
	components?: unknown[];
	flags?: number[];
	/** @everyone/@here 악용을 막기 위해 멘션 해석을 항상 끕니다. */
	allowedMentions: { parse: [] };
}

interface CustomCommandChannel {
	send(payload: CustomCommandSendPayload): Promise<unknown>;
}

interface CustomCommandTriggerMessage {
	react(emoji: string): Promise<unknown>;
	pin(): Promise<unknown>;
	delete(): Promise<unknown>;
}

interface CustomCommandRoleInfo {
	id: string;
	position: number;
	managed: boolean;
}

export interface CustomCommandGuildContext {
	botTopRolePosition: number;
	botCanManageRoles: boolean;
	getRole(roleId: string): CustomCommandRoleInfo | null;
}

export interface CustomCommandMemberContext {
	id: string;
	permissions: bigint;
	hasRole(roleId: string): boolean;
	addRole(roleId: string): Promise<unknown>;
	removeRole(roleId: string): Promise<unknown>;
}

export interface CustomCommandContext {
	channel: CustomCommandChannel;
	renderDesign(design: CustomCommandDesign, substitute: (text: string) => string): unknown;
	member: CustomCommandMemberContext;
	guild: CustomCommandGuildContext;
	channelId: string;
	args: string[];
	triggerMessage?: CustomCommandTriggerMessage;
}

export type CustomCommandRunResult =
	| { kind: 'ok'; sent: number }
	| { kind: 'invalid_spec' }
	| { kind: 'access_denied' }
	| { kind: 'action_failed'; sent: number; stepIndex: number; reason: string };

function sanitizeArg(value: string): string {
	return value.replace(/<@!?\d{17,20}>|<@&\d{17,20}>|<#\d{17,20}>|<a?:\w+:\d{17,20}>/gu, '');
}

function substituteArgs(text: string, args: string[]): string {
	return text.replace(/\{argv(\d+)\}/gu, (_match, digits: string) => {
		const index = Number(digits);
		return index < CUSTOM_COMMAND_MAX_ARGS && args[index] !== undefined ? sanitizeArg(args[index]!) : '';
	});
}

const PERMISSION_BITS: Record<string, bigint> = {
	ManageRoles: 0x10000000n,
	ManageChannels: 0x10n,
	ManageMessages: 0x2000n,
	Administrator: 0x8n
};

function checkAccess(access: CustomCommandAccess | undefined, ctx: CustomCommandContext): string | null {
	if (!access || access.mode === 'everyone') return null;
	if (access.mode === 'roles') {
		return (access.roleIds ?? []).some((roleId) => ctx.member.hasRole(roleId)) ? null : '허용된 역할을 갖고 있지 않아요';
	}
	const required = access.permissions ?? [];
	const all = required.every(
		(permission) => (ctx.member.permissions & (PERMISSION_BITS[permission] ?? 0n)) === (PERMISSION_BITS[permission] ?? 0n)
	);
	return all ? null : '허용된 권한을 갖고 있지 않아요';
}

function checkRoleAction(roleId: string, ctx: CustomCommandContext): string | null {
	const role = ctx.guild.getRole(roleId);
	if (!role) return '그 역할을 서버에서 찾지 못했어요';
	if (role.managed) return '봇 전용 역할은 변경할 수 없어요';
	if (!ctx.guild.botCanManageRoles) return '봇에 역할 관리 권한이 없어요';
	if (role.position >= ctx.guild.botTopRolePosition) return '봇의 역할보다 높은 역할은 변경할 수 없어요';
	return null;
}

interface RunState {
	sent: number;
	failed: { stepIndex: number; reason: string } | null;
}

async function runSteps(steps: readonly CustomCommandStep[], ctx: CustomCommandContext, state: RunState, baseIndex: number): Promise<void> {
	for (const [offset, step] of steps.entries()) {
		const stepIndex = baseIndex + offset;
		if (state.failed) return;

		switch (step.type) {
			case 'delay':
				await sleep(step.seconds * 1000);
				break;
			case 'send_message': {
				try {
					if (step.design) {
						await ctx.channel.send({
							components: [ctx.renderDesign(step.design, (text) => substituteArgs(text, ctx.args))],
							flags: [MessageFlags.IsComponentsV2],
							allowedMentions: { parse: [] }
						});
					} else {
						await ctx.channel.send({ content: substituteArgs(step.text ?? '', ctx.args), allowedMentions: { parse: [] } });
					}
					state.sent++;
				} catch {
					state.failed = { stepIndex, reason: '메시지를 보내지 못했어요 (채널 삭제·권한 상실 등)' };
				}
				break;
			}
			case 'add_role':
			case 'remove_role': {
				const reason = checkRoleAction(step.roleId, ctx);
				if (reason) {
					state.failed = { stepIndex, reason };
					return;
				}
				try {
					if (step.type === 'add_role') await ctx.member.addRole(step.roleId);
					else await ctx.member.removeRole(step.roleId);
				} catch {
					state.failed = { stepIndex, reason: '역할을 변경하지 못했어요' };
					return;
				}
				break;
			}
			case 'add_reaction': {
				if (!ctx.triggerMessage) {
					state.failed = { stepIndex, reason: '실행 메시지를 찾을 수 없어요' };
					return;
				}
				try {
					await ctx.triggerMessage.react(step.emoji);
				} catch {
					state.failed = { stepIndex, reason: '반응을 추가하지 못했어요' };
					return;
				}
				break;
			}
			case 'pin_message': {
				if (!ctx.triggerMessage) {
					state.failed = { stepIndex, reason: '실행 메시지를 찾을 수 없어요' };
					return;
				}
				try {
					await ctx.triggerMessage.pin();
				} catch {
					state.failed = { stepIndex, reason: '메시지를 고정하지 못했어요 (권한 확인이 필요해요)' };
					return;
				}
				break;
			}
			case 'delete_trigger': {
				const trigger = ctx.triggerMessage;
				if (!trigger) {
					state.failed = { stepIndex, reason: '실행 메시지를 찾을 수 없어요' };
					return;
				}
				// 발사 후 대기 — 지연 삭제가 남은 스텝 진행을 막지 않아요
				setTimeout(() => void trigger.delete().catch(() => undefined), step.afterSeconds * 1000);
				break;
			}
			case 'if': {
				let matched: boolean;
				switch (step.condition.kind) {
					case 'has_role':
						matched = ctx.member.hasRole(step.condition.roleId);
						break;
					case 'channel_match':
						matched = ctx.channelId === step.condition.channelId;
						break;
					case 'arg_matches': {
						const value = ctx.args[step.condition.index];
						matched = value !== undefined && sanitizeArg(value) === step.condition.value;
						break;
					}
				}
				const branch = matched ? step.then : (step.else ?? []);
				await runSteps(branch, ctx, state, stepIndex + 1);
				break;
			}
		}
	}
}

export async function runCustomCommandSpec(rawSpec: unknown, ctx: CustomCommandContext): Promise<CustomCommandRunResult> {
	const parsed = customCommandSpecSchema.safeParse(rawSpec);
	if (!parsed.success) return { kind: 'invalid_spec' };

	const access = parsed.data.version === 2 ? parsed.data.access : undefined;
	const accessReason = checkAccess(access, ctx);
	if (accessReason) return { kind: 'access_denied' };

	const state: RunState = { sent: 0, failed: null };
	await runSteps(parsed.data.steps, ctx, state, 0);
	if (state.failed) return { kind: 'action_failed', sent: state.sent, stepIndex: state.failed.stepIndex, reason: state.failed.reason };
	return { kind: 'ok', sent: state.sent };
}
