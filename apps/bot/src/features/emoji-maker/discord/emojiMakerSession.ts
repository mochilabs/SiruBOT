import { randomUUID } from 'node:crypto';
import { emoji } from '@sirubot/utils';
import {
	ActionRowBuilder,
	AttachmentBuilder,
	MessageFlags,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type StringSelectMenuInteraction,
	type ChatInputCommandInteraction,
	type MessageComponentInteraction
} from 'discord.js';
import { AppError } from '../../../lib/appError.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import { createComponentSession } from '../../../lib/componentSession.ts';
import { notice } from '../../../lib/notice.ts';
import { normalizeEmojiName } from '../application/emojiName.ts';
import type { EmojiMaker, PreparedPrompt } from '../application/emojiMaker.ts';
import { mojiId } from './customIds.ts';
import { createGuildEmoji, emojiPermissionProblem } from './emojiRegistration.ts';
import { candidateFileName, emojiMakerView, type EmojiMakerViewState } from './views/emojiMaker.ts';

const SESSION_MS = 5 * 60_000;
const NAME_FORM_MS = 2 * 60_000;

const toFiles = (images: Buffer[]) => images.map((image, i) => new AttachmentBuilder(image, { name: candidateFileName(i) }));

/**
 * `/이모지만들기` 결과 메시지 한 개의 수명 — 후보 이미지를 메모리에 들고 있다가
 * 등록 셀렉트 메뉴(이름 모달 → 서버 이모지 생성)과 다시 그리기 버튼을 처리해요. 5분이 지나면 메뉴와 버튼을 닫아요.
 */
export async function runEmojiMakerSession(
	interaction: ChatInputCommandInteraction<'cached'>,
	maker: EmojiMaker,
	logger: AppLogger,
	description: string
): Promise<void> {
	const prepared: PreparedPrompt = await maker.prepare(description);
	let images = (await maker.draw(interaction.user.id, prepared.prompt)).images;

	const state: EmojiMakerViewState & { registered: Map<number, string> } = {
		description: prepared.description,
		translatedPrompt: prepared.translated ? prepared.prompt : null,
		candidateCount: images.length,
		registered: new Map(),
		phase: 'active'
	};
	const render = () => [emojiMakerView(state)];

	const message = await interaction.editReply({
		components: render(),
		files: toFiles(images),
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { parse: [] }
	});
	const refresh = () =>
		interaction.editReply({ components: render() }).catch((error) => logger.warn(`[emoji-maker] 결과 메시지 갱신 실패: ${error}`));

	const replyNotice = async (component: MessageComponentInteraction, text: string): Promise<void> => {
		await component.reply({ components: [notice(text)], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
	};

	async function register(picker: StringSelectMenuInteraction<'cached'>, index: number): Promise<void> {
		const problem = emojiPermissionProblem(picker.member, picker.guild.members.me);
		if (problem) return replyNotice(picker, problem);
		// 모달이 열려 있는 동안 다시 그리기를 눌러도 처음 고른 그림이 등록되게 지금 붙잡아 둬요.
		const image = images[index];
		if (!image) return replyNotice(picker, `${emoji('error')} 후보를 찾을 수 없어요.`);

		const formId = mojiId.encode('nameForm', { formId: randomUUID() });
		await picker.showModal(
			new ModalBuilder()
				.setCustomId(formId)
				.setTitle(`${index + 1}번 후보 등록`)
				.addComponents(
					new ActionRowBuilder<TextInputBuilder>().addComponents(
						new TextInputBuilder()
							.setCustomId(mojiId.encode('nameValue'))
							.setLabel('이모지 이름 (영문·숫자·밑줄 2~32자)')
							.setStyle(TextInputStyle.Short)
							.setRequired(true)
							.setMinLength(2)
							.setMaxLength(32)
							.setValue(prepared.suggestedName)
					)
				)
		);
		// 셀렉트 메뉴는 이미 선택된 값을 다시 고르면 이벤트가 오지 않아요. 모달을 닫고 같은 후보를 다시 고를 수 있게 선택을 바로 비워요.
		void refresh();
		const submitted = await picker
			.awaitModalSubmit({ time: NAME_FORM_MS, filter: (s) => s.user.id === interaction.user.id && s.customId === formId })
			.catch(() => null);
		if (!submitted) return;
		await submitted.deferReply({ flags: [MessageFlags.Ephemeral] });

		const name = normalizeEmojiName(submitted.fields.getTextInputValue(mojiId.encode('nameValue')));
		if (!name) {
			await submitted.editReply({
				components: [notice(`${emoji('error')} 이름은 영문·숫자·밑줄로 2~32자만 쓸 수 있어요.`)],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}
		try {
			const markup = await createGuildEmoji(picker.guild, image, name, `${interaction.user.username} 님이 /이모지만들기로 등록`);
			if (images[index] === image) state.registered.set(index, markup);
			await submitted.editReply({
				components: [notice(`${emoji('success')} ${markup} \`:${name}:\` 이모지를 등록했어요!`)],
				flags: [MessageFlags.IsComponentsV2]
			});
			await refresh();
		} catch (error) {
			if (!(error instanceof Error && error.cause)) logger.error('[emoji-maker] 이모지 등록 실패', error);
			await submitted.editReply({
				components: [notice(error instanceof Error ? error.message : `${emoji('error')} 이모지를 등록하지 못했어요.`)],
				flags: [MessageFlags.IsComponentsV2]
			});
		}
	}

	async function reroll(component: MessageComponentInteraction): Promise<void> {
		await component.deferUpdate();
		state.phase = 'busy';
		state.feedback = undefined;
		await refresh();
		try {
			images = (await maker.draw(interaction.user.id, prepared.prompt)).images;
			state.registered.clear();
			state.candidateCount = images.length;
			state.phase = session.settled ? 'expired' : 'active';
			await interaction.editReply({ components: render(), files: toFiles(images), attachments: [] });
		} catch (error) {
			state.phase = session.settled ? 'expired' : 'active';
			state.feedback = error instanceof AppError ? `${emoji('error')} ${error.userMessage}` : `${emoji('error')} 다시 그리지 못했어요.`;
			if (!(error instanceof AppError)) logger.error('[emoji-maker] 다시 그리기 실패', error);
			await refresh();
		}
	}

	const session = createComponentSession(message, {
		time: SESSION_MS,
		owner: { userId: interaction.user.id, accept: (component) => mojiId.decode(component.customId) !== null },
		logger,
		onCollect: async (component) => {
			const decoded = mojiId.decode(component.customId);
			if (!decoded || !component.inCachedGuild()) return;
			if (state.phase === 'busy') return replyNotice(component, `${emoji('error')} 지금 그리는 중이에요. 잠시만 기다려 주세요.`);
			if (decoded.action === 'pick' && component.isStringSelectMenu()) {
				const index = Number(component.values[0]);
				if (!Number.isInteger(index) || index < 0 || index >= state.candidateCount)
					return replyNotice(component, `${emoji('error')} 후보를 찾을 수 없어요.`);
				return register(component, index);
			}
			if (decoded.action === 'reroll') return reroll(component);
		},
		onTimeout: async () => {
			if (state.phase !== 'busy') state.phase = 'expired';
			await refresh();
		}
	});
}
