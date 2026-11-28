import { AppError } from '../../../lib/appError.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import { suggestEmojiName } from './emojiName.ts';
import { ImageReaderError, type ImageReader } from './imageReader.ts';
import { MojiError, type MojiClient, type MojiProgress } from './mojiClient.ts';
import type { PromptTranslator } from './promptTranslator.ts';

export const MAX_DESCRIPTION_LENGTH = 200;
export const CANDIDATE_COUNT = 4;

export interface PreparedPrompt {
	description: string;
	prompt: string;
	source: 'text' | 'image';
	translated: boolean;
	suggestedName: string;
}

export interface EmojiMakerDeps {
	logger: AppLogger;
	client: MojiClient;
	translator: PromptTranslator;
	imageReader: ImageReader;
}

export interface PrepareInput {
	description?: string | null;
	imageUrl?: string | null;
	imageType?: string | null;
}

export interface EmojiMaker {
	isEnabled(): boolean;
	canReadImages(): boolean;
	prepare(input: PrepareInput): Promise<PreparedPrompt>;
	draw(userId: string, prompt: string, onProgress?: (progress: MojiProgress) => void): Promise<{ images: Buffer[]; seed: number }>;
}

export function createEmojiMaker(deps: EmojiMakerDeps): EmojiMaker {
	const drawing = new Set<string>();

	async function readImage(imageUrl: string, note: string, imageType?: string | null): Promise<{ prompt: string; subject: string | null }> {
		let reading;
		try {
			reading = await deps.imageReader.read(imageUrl, note, imageType);
		} catch (error) {
			if (error instanceof ImageReaderError && error.code === 'not_configured') {
				throw new AppError('unavailable', '이 봇에서는 이미지로 이모지 만들기가 꺼져 있어요. 설명으로 만들어 주세요.', {
					cause: error,
					ephemeral: true
				});
			}
			deps.logger.error(`[emoji-maker] 이미지 판독 실패: ${error}`);
			throw new AppError('unavailable', '이미지를 읽지 못했어요. 잠시 뒤 다시 시도하거나 설명으로 만들어 주세요.', {
				cause: error,
				ephemeral: true
			});
		}
		if (reading.kind === 'nsfw') {
			throw new AppError('forbidden', '부적절한 이미지라 이모지로 만들 수 없어요.', { ephemeral: true });
		}
		return { prompt: reading.prompt, subject: reading.subject };
	}

	return {
		isEnabled: () => deps.client.isEnabled(),

		canReadImages: () => deps.imageReader.isEnabled(),

		async prepare(input) {
			const description = (input.description ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTION_LENGTH);
			if (input.imageUrl) {
				const { prompt, subject } = await readImage(input.imageUrl, description, input.imageType);
				// 이미지 설명은 길어서 이름은 짧은 대상 이름(예: tabby_cat)으로 지어요.
				return { description, prompt, source: 'image', translated: true, suggestedName: suggestEmojiName(subject ?? prompt) };
			}
			if (!description) throw new AppError('invalid_input', '그릴 이모지를 설명하거나 이미지를 첨부해 주세요.', { ephemeral: true });
			const { prompt, translated } = await deps.translator.toEnglish(description);
			return { description, prompt, source: 'text', translated, suggestedName: suggestEmojiName(prompt) };
		},

		async draw(userId, prompt, onProgress) {
			if (drawing.has(userId)) {
				throw new AppError('conflict', '이미 그리고 있는 이모지가 있어요. 끝나면 다시 시도해 주세요.', { ephemeral: true });
			}
			drawing.add(userId);
			try {
				const result = await deps.client.generate(prompt, { n: CANDIDATE_COUNT, onProgress });
				return { images: result.images, seed: result.seed };
			} catch (error) {
				if (error instanceof MojiError) {
					if (error.code === 'not_configured') {
						throw new AppError('unavailable', '이 봇에서는 이모지 생성이 꺼져 있어요.', { cause: error, ephemeral: true });
					}
					if (error.code === 'busy') {
						throw new AppError('unavailable', '지금 이모지를 그리려는 사람이 많아요. 잠시 뒤 다시 시도해 주세요.', {
							cause: error,
							ephemeral: true
						});
					}
					deps.logger.error(`[emoji-maker] 생성 실패: ${error.message}`);
					throw new AppError('unavailable', '이모지를 그리지 못했어요. 잠시 뒤 다시 시도해 주세요.', { cause: error, ephemeral: true });
				}
				throw error;
			} finally {
				drawing.delete(userId);
			}
		}
	};
}
