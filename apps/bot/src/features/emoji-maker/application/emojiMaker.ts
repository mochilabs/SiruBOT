import { AppError } from '../../../lib/appError.ts';
import type { AppLogger } from '../../../lib/appLogger.ts';
import { suggestEmojiName } from './emojiName.ts';
import { ImageReaderError, type ImageReader } from './imageReader.ts';
import { MojiError, type MojiClient } from './mojiClient.ts';
import type { PromptTranslator } from './promptTranslator.ts';

export const MAX_DESCRIPTION_LENGTH = 200;
export const CANDIDATE_COUNT = 4;

export interface PreparedPrompt {
	/** 사용자가 입력한 설명 (이미지만 보냈으면 빈 문자열) */
	description: string;
	/** 생성 서버에 보낼 영어 설명 */
	prompt: string;
	/** 'text' 설명만 · 'image' 첨부 이미지를 읽어 만든 설명 */
	source: 'text' | 'image';
	/** 원문과 다른 영어 설명을 보냈는지 (번역했거나 이미지에서 만들었으면 true) */
	translated: boolean;
	/** 등록 모달에 미리 채울 이름 */
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
	/** 첨부 이미지 URL — 있으면 비전 모델로 읽고, 설명은 무엇을 그릴지 고르는 메모로 써요. */
	imageUrl?: string | null;
}

export interface EmojiMaker {
	isEnabled(): boolean;
	/** 이미지로 만들기를 쓸 수 있는지 (비전 LLM 설정이 있는지) */
	canReadImages(): boolean;
	/** 설명을 다듬어 영어로 옮기거나, 이미지를 읽어 설명을 만들어요. 다시 그리기는 이 결과를 재사용해요. */
	prepare(input: PrepareInput): Promise<PreparedPrompt>;
	/** 후보 4장을 그려요. 한 사람은 한 번에 하나만 그릴 수 있어요. */
	draw(userId: string, prompt: string): Promise<{ images: Buffer[]; seed: number }>;
}

export function createEmojiMaker(deps: EmojiMakerDeps): EmojiMaker {
	// 같은 사람이 버튼·명령을 연타해 서버 대기열을 혼자 채우지 않게 막는 진행 중 표시예요 (인스턴스 소유).
	const drawing = new Set<string>();

	async function readImage(imageUrl: string, note: string): Promise<string> {
		let reading;
		try {
			reading = await deps.imageReader.read(imageUrl, note);
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
		return reading.prompt;
	}

	return {
		isEnabled: () => deps.client.isEnabled(),

		canReadImages: () => deps.imageReader.isEnabled(),

		async prepare(input) {
			const description = (input.description ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_DESCRIPTION_LENGTH);
			if (input.imageUrl) {
				const prompt = await readImage(input.imageUrl, description);
				return { description, prompt, source: 'image', translated: true, suggestedName: suggestEmojiName(prompt) };
			}
			if (!description) throw new AppError('invalid_input', '그릴 이모지를 설명하거나 이미지를 첨부해 주세요.', { ephemeral: true });
			const { prompt, translated } = await deps.translator.toEnglish(description);
			return { description, prompt, source: 'text', translated, suggestedName: suggestEmojiName(prompt) };
		},

		async draw(userId, prompt) {
			if (drawing.has(userId)) {
				throw new AppError('conflict', '이미 그리고 있는 이모지가 있어요. 끝나면 다시 시도해 주세요.', { ephemeral: true });
			}
			drawing.add(userId);
			try {
				const result = await deps.client.generate(prompt, { n: CANDIDATE_COUNT });
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
