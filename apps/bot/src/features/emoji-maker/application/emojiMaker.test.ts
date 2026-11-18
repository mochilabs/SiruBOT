import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { createEmojiMaker } from './emojiMaker.ts';
import { ImageReaderError, type ImageReader, type ImageReading } from './imageReader.ts';
import { MojiError, type MojiClient } from './mojiClient.ts';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const translator = { toEnglish: vi.fn(async (text: string) => ({ prompt: text === '고양이' ? 'cat' : text, translated: text === '고양이' })) };

const noImages: ImageReader = { isEnabled: () => false, read: vi.fn() };
const imageReader = (result: ImageReading | Error): ImageReader => ({
	isEnabled: () => true,
	read: vi.fn(async () => {
		if (result instanceof Error) throw result;
		return result;
	})
});

function client(generate: MojiClient['generate']): MojiClient {
	return { isEnabled: () => true, generate };
}

describe('createEmojiMaker', () => {
	it('prepares a translated prompt with a suggested name', async () => {
		const maker = createEmojiMaker({ logger, translator, imageReader: noImages, client: client(vi.fn()) });
		expect(await maker.prepare({ description: '  고양이  ' })).toEqual({
			description: '고양이',
			prompt: 'cat',
			source: 'text',
			translated: true,
			suggestedName: 'cat'
		});
		await expect(maker.prepare({ description: '   ' })).rejects.toBeInstanceOf(AppError);
		await expect(maker.prepare({})).rejects.toMatchObject({ kind: 'invalid_input' });
	});

	it('asks for four candidates', async () => {
		const generate = vi.fn(async () => ({ images: [Buffer.from('a')], seed: 3, device: 'webgpu' }));
		const maker = createEmojiMaker({ logger, translator, imageReader: noImages, client: client(generate) });
		expect(await maker.draw('u1', 'cat')).toEqual({ images: [Buffer.from('a')], seed: 3 });
		expect(generate).toHaveBeenCalledWith('cat', { n: 4 });
	});

	it('lets one user draw one thing at a time', async () => {
		const pending: Array<() => void> = [];
		const generate = vi.fn(
			() =>
				new Promise<{ images: Buffer[]; seed: number; device: string }>((r) => pending.push(() => r({ images: [], seed: 0, device: 'cpu' })))
		);
		const maker = createEmojiMaker({ logger, translator, imageReader: noImages, client: client(generate) });
		const first = maker.draw('u1', 'cat');
		await expect(maker.draw('u1', 'dog')).rejects.toMatchObject({ kind: 'conflict' });
		const other = maker.draw('u2', 'dog');
		pending.forEach((resolve) => resolve());
		await Promise.all([first, other]);
		generate.mockResolvedValueOnce({ images: [], seed: 1, device: 'cpu' });
		await expect(maker.draw('u1', 'cat')).resolves.toBeDefined();
	});

	it('turns service errors into user-facing AppErrors', async () => {
		for (const [code, kind] of [
			['busy', 'unavailable'],
			['unavailable', 'unavailable'],
			['not_configured', 'unavailable']
		] as const) {
			const maker = createEmojiMaker({
				logger,
				translator,
				imageReader: noImages,
				client: client(async () => {
					throw new MojiError(code, code);
				})
			});
			await expect(maker.draw('u1', 'cat')).rejects.toMatchObject({ kind });
		}
	});

	it('reads an attached image into a prompt, using the description as a note', async () => {
		const reader = imageReader({ kind: 'ok', prompt: 'orange cat wearing a crown' });
		const maker = createEmojiMaker({ logger, translator, imageReader: reader, client: client(vi.fn()) });
		expect(await maker.prepare({ description: '왕관 씌워줘', imageUrl: 'https://cdn/a.png' })).toEqual({
			description: '왕관 씌워줘',
			prompt: 'orange cat wearing a crown',
			source: 'image',
			translated: true,
			suggestedName: 'orange_cat_wearing_a_crown'
		});
		expect(reader.read).toHaveBeenCalledWith('https://cdn/a.png', '왕관 씌워줘');
		expect(translator.toEnglish).not.toHaveBeenCalledWith('왕관 씌워줘');
	});

	it('rejects NSFW images and fails closed when the image cannot be read', async () => {
		const prepare = (reader: ImageReader) =>
			createEmojiMaker({ logger, translator, imageReader: reader, client: client(vi.fn()) }).prepare({ imageUrl: 'https://cdn/a.png' });
		await expect(prepare(imageReader({ kind: 'nsfw' }))).rejects.toMatchObject({
			kind: 'forbidden',
			userMessage: '부적절한 이미지라 이모지로 만들 수 없어요.'
		});
		await expect(prepare(imageReader(new ImageReaderError('failed', 'x')))).rejects.toMatchObject({ kind: 'unavailable' });
		await expect(prepare(imageReader(new ImageReaderError('not_configured', 'x')))).rejects.toMatchObject({ kind: 'unavailable' });
	});
});
