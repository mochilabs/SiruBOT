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
import type { EmojiMaker, PrepareInput, PreparedPrompt } from '../application/emojiMaker.ts';
import { mojiId } from './customIds.ts';
import { createGuildEmoji, emojiPermissionProblem } from './emojiRegistration.ts';
import { createProgressPainter } from './progressPainter.ts';
import { candidateFileName, emojiMakerView, type EmojiMakerViewState } from './views/emojiMaker.ts';
import { emojiProgressView, PREVIEW_FILE_NAME, type EmojiProgressViewState } from './views/emojiProgress.ts';
import type { MojiProgress } from '../application/mojiClient.ts';

const SESSION_MS = 5 * 60_000;
const NAME_FORM_MS = 2 * 60_000;
/** 진행 화면 편집 최소 간격 — 디스코드 편집 제한 안에서 미리보기가 움직여 보이는 정도예요. */
const PROGRESS_EDIT_MS = 800;

const toFiles = (images: Buffer[]) => images.map((image, i) => new AttachmentBuilder(image, { name: candidateFileName(i) }));

/**
 * `/이모지만들기` 결과 메시지 한 개의 수명 — 후보 이미지를 메모리에 들고 있다가
 * 등록 셀렉트 메뉴(이름 모달 → 서버 이모지 생성)과 다시 그리기 버튼을 처리해요. 5분이 지나면 메뉴와 버튼을 닫아요.
 */
export async function runEmojiMakerSession(
	interaction: ChatInputCommandInteraction<'cached'>,
	maker: EmojiMaker,
	logger: AppLogger,
	input: PrepareInput
): Promise<void> {
	const painter = createProgressPainter({
		minIntervalMs: PROGRESS_EDIT_MS,
		onError: (error) => logger.warn(`[emoji-maker] 진행 화면 갱신 실패: ${error}`)
	});
	const progress: EmojiProgressViewState = {
		description: (input.description ?? '').trim(),
		fromImage: Boolean(input.imageUrl),
		readDone: false,
		readPrompt: null,
		queueAhead: null,
		drawing: null,
		hasPreview: false
	};
	let preview: Buffer | null = null;
	const paintProgress = (force: boolean) =>
		painter.paint(
			() =>
				interaction.editReply({
					components: [emojiProgressView({ ...progress, hasPreview: preview !== null })],
					files: preview ? [new AttachmentBuilder(preview, { name: PREVIEW_FILE_NAME })] : [],
					attachments: [],
					flags: [MessageFlags.IsComponentsV2],
					allowedMentions: { parse: [] }
				}),
			{ force }
		);
	/** 서버 진행 이벤트를 화면 상태로 옮겨요. 단계가 바뀌면 바로, 미리보기 프레임은 솎아서 그려요. */
	const onProgress = (event: MojiProgress) => {
		if (event.type === 'queued') {
			progress.queueAhead = event.ahead;
			paintProgress(true);
		} else if (event.type === 'start') {
			progress.queueAhead = null;
			progress.drawing = { step: 0, total: 16 };
			paintProgress(true);
		} else {
			progress.drawing = { step: event.step, total: event.total };
			preview = event.preview;
			paintProgress(false);
		}
	};
	/** 진행 화면을 비우고 다음 그리기를 준비해요 (다시 그리기도 같은 화면을 써요). */
	const resetDrawing = () => {
		progress.queueAhead = null;
		progress.drawing = null;
		preview = null;
	};

	let prepared: PreparedPrompt;
	let images: Buffer[];
	try {
		paintProgress(true);
		prepared = await maker.prepare(input);
		progress.description = prepared.description;
		progress.readDone = true;
		progress.readPrompt = prepared.translated ? prepared.prompt : null;
		paintProgress(true);
		images = (await maker.draw(interaction.user.id, prepared.prompt, onProgress)).images;
	} finally {
		// 늦게 도착한 진행 화면이 결과나 오류 안내를 덮어쓰지 않게 기다려요.
		await painter.settle();
	}

	const state: EmojiMakerViewState & { registered: Map<number, string> } = {
		description: prepared.description,
		translatedPrompt: prepared.translated ? prepared.prompt : null,
		fromImage: prepared.source === 'image',
		candidateCount: images.length,
		registered: new Map(),
		phase: 'active'
	};
	const render = () => [emojiMakerView(state)];

	const message = await interaction.editReply({
		components: render(),
		files: toFiles(images),
		attachments: [],
		flags: [MessageFlags.IsComponentsV2],
		allowedMentions: { parse: [] }
	});
	/** 결과 화면을 다시 그려요. 다시 그리는 중에는 진행 화면이 떠 있으니 건드리지 않아요. */
	const refresh = async () => {
		if (state.phase === 'busy') return;
		await interaction.editReply({ components: render() }).catch((error) => logger.warn(`[emoji-maker] 결과 메시지 갱신 실패: ${error}`));
	};

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
		resetDrawing();
		progress.reroll = true;
		paintProgress(true);
		try {
			images = (await maker.draw(interaction.user.id, prepared.prompt, onProgress)).images;
			state.registered.clear();
			state.candidateCount = images.length;
		} catch (error) {
			state.feedback = error instanceof AppError ? `${emoji('error')} ${error.userMessage}` : `${emoji('error')} 다시 그리지 못했어요.`;
			if (!(error instanceof AppError)) logger.error('[emoji-maker] 다시 그리기 실패', error);
		}
		await painter.settle();
		state.phase = session.settled ? 'expired' : 'active';
		// 실패해도 진행 화면을 걷어내고 마지막 후보들을 다시 보여줘요.
		await interaction
			.editReply({ components: render(), files: toFiles(images), attachments: [] })
			.catch((error) => logger.warn(`[emoji-maker] 결과 메시지 갱신 실패: ${error}`));
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
			// 다시 그리는 중이면 그 흐름이 끝나면서 만료 화면을 그려요.
			if (state.phase === 'busy') return;
			state.phase = 'expired';
			await refresh();
		}
	});
}
