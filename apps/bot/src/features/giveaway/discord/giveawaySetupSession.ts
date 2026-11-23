import { randomUUID } from 'node:crypto';
import { container } from '@sapphire/framework';
import {
	ActionRowBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type ChannelSelectMenuInteraction,
	type ChatInputCommandInteraction,
	type MessageComponentInteraction,
	type ModalSubmitInteraction,
	type RoleSelectMenuInteraction,
	type StringSelectMenuInteraction
} from 'discord.js';
import { emoji } from '@sirubot/utils';
import { AppError } from '../../../lib/appError.ts';
import { createComponentSession } from '../../../lib/componentSession.ts';
import {
	missingSetupFields,
	parseSetupDays,
	parseSetupEnd,
	parseSetupPrize,
	parseSetupWinners,
	quickDuration,
	resolveSetupEnd,
	setupConditions,
	type GiveawaySetupState,
	type SetupParse
} from '../application/giveawaySetup.ts';
import { giveawaySetupId } from './customIds.ts';
import { giveawaySetupView } from './views/giveawaySetupView.ts';
import { giveawayNoticeView } from './views/giveawayViews.ts';

const SESSION_MS = 10 * 60_000;
const SESSION_IDLE_MS = 5 * 60_000;
const FORM_MS = 3 * 60_000;

type PanelInput = StringSelectMenuInteraction | ChannelSelectMenuInteraction | RoleSelectMenuInteraction | MessageComponentInteraction;

interface FormField {
	id: Parameters<typeof giveawaySetupId.encode>[0] & ('prizeInput' | 'winnersInput' | 'endInput' | 'joinDaysInput' | 'accountDaysInput');
	label: string;
	value?: string;
	placeholder?: string;
	required: boolean;
	maxLength: number;
}

/**
 * `/나눔 시작` 설정 패널 한 개의 수명 — 값은 메모리에 들고, 버튼·셀렉트·모달로 고칠 때마다 같은 메시지를 다시 그려요.
 * "시작"을 누르면 서비스의 `start`를 부르고(검증은 서비스가 해요), 취소하거나 시간이 지나면 패널을 닫아요.
 */
export async function runGiveawaySetupSession(interaction: ChatInputCommandInteraction<'cached'>, state: GiveawaySetupState): Promise<void> {
	const response = await interaction.editReply(giveawaySetupView(state));
	const guildId = interaction.guildId;

	const notify = (target: PanelInput | ModalSubmitInteraction, message: string) =>
		target.reply({ ...giveawayNoticeView(message), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });

	/** 모달을 띄우고 제출을 기다려요. 시간이 지났으면 null이에요 */
	async function askForm(from: PanelInput, title: string, fields: FormField[]): Promise<ModalSubmitInteraction | null> {
		const formId = giveawaySetupId.encode('form', { formId: randomUUID() });
		await from.showModal(
			new ModalBuilder()
				.setCustomId(formId)
				.setTitle(title)
				.addComponents(
					fields.map((f) => {
						const input = new TextInputBuilder()
							.setCustomId(giveawaySetupId.encode(f.id))
							.setLabel(f.label)
							.setStyle(TextInputStyle.Short)
							.setRequired(f.required)
							.setMaxLength(f.maxLength);
						if (f.value) input.setValue(f.value.slice(0, f.maxLength));
						if (f.placeholder) input.setPlaceholder(f.placeholder);
						return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
					})
				)
		);
		return from.awaitModalSubmit({ time: FORM_MS, filter: (s) => s.user.id === interaction.user.id && s.customId === formId }).catch(() => null);
	}

	/** 모달 값이 올바르면 상태에 반영하고 패널을 다시 그려요. 틀렸으면 본인에게만 이유를 알려요 */
	async function applyForm(submitted: ModalSubmitInteraction, apply: () => SetupParse<unknown>[]): Promise<void> {
		const failed = apply().find((result) => !result.ok);
		if (failed && !failed.ok) {
			await notify(submitted, `${emoji('error')} ${failed.message}`);
			return;
		}
		if (submitted.isFromMessage()) await submitted.update(giveawaySetupView(state));
		else await submitted.deferUpdate();
	}

	const input = (submitted: ModalSubmitInteraction, id: FormField['id']) => submitted.fields.getTextInputValue(giveawaySetupId.encode(id));

	async function start(button: MessageComponentInteraction, session: { settle(reason?: string): boolean }): Promise<void> {
		if (missingSetupFields(state).length > 0) return;
		const endsAt = resolveSetupEnd(state.end, new Date());
		if (!endsAt || !state.prize) return;
		await button.deferUpdate();
		try {
			await container.giveaways.start({
				guildId,
				channelId: state.channelId,
				userId: interaction.user.id,
				prize: state.prize,
				winnerCount: state.winnerCount,
				endsAt,
				conditions: setupConditions(state)
			});
		} catch (error) {
			if (error instanceof AppError) {
				await button.followUp({ ...giveawayNoticeView(error.userMessage), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
				return;
			}
			throw error;
		}
		session.settle('started');
		await button.editReply(giveawayNoticeView(`${emoji('success')} 나눔을 열었어요. <#${state.channelId}>에서 확인하세요.`));
	}

	createComponentSession<PanelInput>(response, {
		owner: { userId: interaction.user.id },
		time: SESSION_MS,
		idle: SESSION_IDLE_MS,
		onCollect: async (component, session) => {
			const decoded = giveawaySetupId.decode(component.customId);
			if (!decoded) return;
			const redraw = () => (component as MessageComponentInteraction).update(giveawaySetupView(state));
			// @everyone은 모두에게 있는 역할이라 조건으로 두면 의미가 없거나(필요) 전원이 막혀요(제외).
			const roles = (values: readonly string[]) => values.filter((id) => id !== guildId);

			switch (decoded.action) {
				case 'quick': {
					const picked = quickDuration((component as StringSelectMenuInteraction).values[0] ?? '');
					if (picked) state.end = { kind: 'relative', ms: picked.ms };
					await redraw();
					return;
				}
				case 'channel':
					state.channelId = (component as ChannelSelectMenuInteraction).values[0] ?? state.channelId;
					await redraw();
					return;
				case 'required':
					state.requiredRoleIds = roles((component as RoleSelectMenuInteraction).values);
					await redraw();
					return;
				case 'blocked':
					state.blockedRoleIds = roles((component as RoleSelectMenuInteraction).values);
					await redraw();
					return;
				case 'match':
					state.requiredMatch = state.requiredMatch === 'all' ? 'any' : 'all';
					await redraw();
					return;
				case 'cancel':
					session.settle('cancelled');
					await (component as MessageComponentInteraction).update(giveawayNoticeView(`${emoji('info')} 나눔 만들기를 취소했어요.`));
					return;
				case 'start':
					await start(component, session);
					return;
				case 'prize': {
					const submitted = await askForm(component, '상품과 당첨자 수', [
						{ id: 'prizeInput', label: '상품', value: state.prize ?? undefined, required: true, maxLength: 200 },
						{ id: 'winnersInput', label: '당첨자 수', value: String(state.winnerCount), required: true, maxLength: 2 }
					]);
					if (!submitted) return;
					await applyForm(submitted, () => {
						const prize = parseSetupPrize(input(submitted, 'prizeInput'));
						const winners = parseSetupWinners(input(submitted, 'winnersInput'));
						if (prize.ok && winners.ok) {
							state.prize = prize.value;
							state.winnerCount = winners.value;
						}
						return [prize, winners];
					});
					return;
				}
				case 'end': {
					const submitted = await askForm(component, '마감 직접 입력', [
						{
							id: 'endInput',
							label: '기간 또는 한국 시간 마감시각',
							placeholder: '30분, 2h, 1d12h 또는 2026-12-25 21:00',
							required: true,
							maxLength: 16
						}
					]);
					if (!submitted) return;
					await applyForm(submitted, () => {
						const end = parseSetupEnd(input(submitted, 'endInput'));
						if (end.ok) state.end = end.value;
						return [end];
					});
					return;
				}
				case 'days': {
					const submitted = await askForm(component, '가입·계정 일수 조건', [
						{
							id: 'joinDaysInput',
							label: '서버에 들어온 지 N일 이상 (비우면 조건 없음)',
							value: state.minJoinDays ? String(state.minJoinDays) : undefined,
							required: false,
							maxLength: 4
						},
						{
							id: 'accountDaysInput',
							label: '계정을 만든 지 N일 이상 (비우면 조건 없음)',
							value: state.minAccountDays ? String(state.minAccountDays) : undefined,
							required: false,
							maxLength: 4
						}
					]);
					if (!submitted) return;
					await applyForm(submitted, () => {
						const join = parseSetupDays(input(submitted, 'joinDaysInput'), '가입 일수');
						const account = parseSetupDays(input(submitted, 'accountDaysInput'), '계정 일수');
						if (join.ok && account.ok) {
							state.minJoinDays = join.value;
							state.minAccountDays = account.value;
						}
						return [join, account];
					});
					return;
				}
				default:
					return;
			}
		},
		onTimeout: async () => {
			await interaction
				.editReply(giveawayNoticeView(`${emoji('info')} 시간이 지나서 나눔 만들기를 닫았어요. 다시 \`/나눔 시작\`을 써 주세요.`))
				.catch(() => undefined);
		}
	});
}
