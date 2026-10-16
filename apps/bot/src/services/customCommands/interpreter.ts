/**
 * 커스텀 명령어 인터프리터 — 검증된 스펙의 스텝을 순차 실행해요 (v1·v2 스펙 모두).
 *
 * - v2 액션 추가는 utils의 customCommandStepSchema와 이 루프를 함께 확장해요.
 * - 실행 제한(access)·역할 위계 같은 안전 검사는 여기서 **실행 시점에 재검증**해요 —
 *   저장 시점 검증만 믿지 않아요 (저장 이후 봇/길드 상태가 바뀔 수 있어요).
 * - send 실패·액션 실패(권한 상실 등)면 같은 실행의 남은 스텝을 중단해요.
 * - 최대 600초의 대기를 품을 수 있어 실행이 메시지 이벤트 처리보다 오래 남아요. 봇 재시작 시
 *   진행 중 실행은 함께 끝나요 (재개 없음 — v1 계약).
 * - 슬래시 실행도 같은 엔진을 써요 — 호출부(리스너)가 ctx.channel을 interaction 응답으로
 *   감싸서 넘기고, delete_trigger는 ctx.triggerMessage.delete()로 동작해요 (슬래시에선 응답 삭제).
 */
import {
	ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	SectionBuilder,
	SeparatorBuilder,
	TextDisplayBuilder
} from 'discord.js';
import {
	CUSTOM_COMMAND_ACCENT_COLOR_VALUES,
	CUSTOM_COMMAND_MAX_ARGS,
	createThumbnail,
	customCommandSpecSchema,
	type CustomCommandAccess,
	type CustomCommandDesign,
	type CustomCommandStep
} from '@sirubot/utils';

export interface CustomCommandSendPayload {
	content?: string;
	components?: unknown[];
	flags?: number[];
	/** 멘션 해석은 항상 꺼요 — 커스텀 명령어 메시지의 @everyone/@here 악용 방지 */
	allowedMentions: { parse: [] };
}

export interface CustomCommandChannel {
	send(payload: CustomCommandSendPayload): Promise<unknown>;
}

/** 리액트/고정/삭제 대상이 되는 '실행을 유발한 메시지' — 접두사에선 트리거 메시지, 슬래시에선 응답 메시지 */
export interface CustomCommandTriggerMessage {
	react(emoji: string): Promise<unknown>;
	pin(): Promise<unknown>;
	delete(): Promise<unknown>;
}

export interface CustomCommandRoleInfo {
	id: string;
	position: number;
	managed: boolean;
}

export interface CustomCommandGuildContext {
	/** 봇 최상위 역할 위치 — 대상 역할보다 높아야 변경 가능 */
	botTopRolePosition: number;
	/** 봇의 ManageRoles 권한 보유 여부 */
	botCanManageRoles: boolean;
	getRole(roleId: string): CustomCommandRoleInfo | null;
}

export interface CustomCommandMemberContext {
	id: string;
	/** 실행자의 채널 기준 권한 비트마스크 (discord.js PermissionFlagsBits) */
	permissions: bigint;
	hasRole(roleId: string): boolean;
	addRole(roleId: string): Promise<unknown>;
	removeRole(roleId: string): Promise<unknown>;
}

export interface CustomCommandContext {
	channel: CustomCommandChannel;
	member: CustomCommandMemberContext;
	guild: CustomCommandGuildContext;
	channelId: string;
	/** 인수 치환 {argv0}~의 값 — 최대 5개 */
	args: string[];
	triggerMessage?: CustomCommandTriggerMessage;
}

export type CustomCommandRunResult =
	| { kind: 'ok'; sent: number }
	| { kind: 'invalid_spec' }
	| { kind: 'access_denied' }
	| { kind: 'action_failed'; sent: number; stepIndex: number; reason: string };

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 인수 값의 디스코드 멘션 문법 제거 — 치환 결과로 핑이 튀는 것을 막아요 */
function sanitizeArg(value: string): string {
	return value.replace(/<@!?\d{17,20}>|<@&\d{17,20}>|<#\d{17,20}>|<a?:\w+:\d{17,20}>/gu, '');
}

/** {argvN} 치환 — N ≥ MAX_ARGS는 빈 문자열 */
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

/** access 판정 — 통과하면 null, 거부 사유(한국어)를 돌려줘요 */
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

/** 역할 변경 사전 검증 — 통과하면 null, 실패 사유(한국어)를 돌려줘요 */
function checkRoleAction(roleId: string, ctx: CustomCommandContext): string | null {
	const role = ctx.guild.getRole(roleId);
	if (!role) return '그 역할을 서버에서 찾지 못했어요';
	if (role.managed) return '봇 전용 역할은 변경할 수 없어요';
	if (!ctx.guild.botCanManageRoles) return '봇에 역할 관리 권한이 없어요';
	if (role.position >= ctx.guild.botTopRolePosition) return '봇의 역할보다 높은 역할은 변경할 수 없어요';
	return null;
}

/** CV2 디자인 → 컨테이너 컴포넌트 */
function buildDesignContainer(design: CustomCommandDesign, args: string[]): ContainerBuilder {
	const container = new ContainerBuilder();
	container.setAccentColor(CUSTOM_COMMAND_ACCENT_COLOR_VALUES[design.accentColor ?? 'blue']);
	for (const item of design.items) {
		switch (item.kind) {
			case 'text':
				container.addTextDisplayComponents(new TextDisplayBuilder().setContent(substituteArgs(item.content, args)));
				break;
			case 'separator':
				container.addSeparatorComponents(new SeparatorBuilder());
				break;
			case 'section': {
				const section = new SectionBuilder().addTextDisplayComponents(
					new TextDisplayBuilder().setContent(substituteArgs(item.content, args))
				);
				section.setThumbnailAccessory(createThumbnail(item.thumbnailUrl));
				container.addSectionComponents(section);
				break;
			}
			case 'media': {
				const gallery = new MediaGalleryBuilder();
				for (const url of item.urls) gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
				container.addMediaGalleryComponents(gallery);
				break;
			}
		}
	}
	return container;
}

interface RunState {
	sent: number;
	failed: { stepIndex: number; reason: string } | null;
}

/** 스텝 배열 실행 — 실패 사유를 state.failed에 남기고 중단해요. if 서브 스텝도 같은 함수로 실행 */
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
							components: [buildDesignContainer(step.design, ctx.args)],
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
