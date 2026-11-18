import { describe, expect, it, vi } from 'vitest';
import { AppError } from '../../../lib/appError.ts';
import { createEmojiMaker } from './emojiMaker.ts';
import { MojiError, type MojiClient } from './mojiClient.ts';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
const translator = { toEnglish: vi.fn(async (text: string) => ({ prompt: text === '고양이' ? 'cat' : text, translated: text === '고양이' })) };

function client(generate: MojiClient['generate']): MojiClient {
	return { isEnabled: () => true, generate };
}

describe('createEmojiMaker', () => {
	it('prepares a translated prompt with a suggested name', async () => {
		const maker = createEmojiMaker({ logger, translator, client: client(vi.fn()) });
		expect(await maker.prepare('  고양이  ')).toEqual({ description: '고양이', prompt: 'cat', translated: true, suggestedName: 'cat' });
		await expect(maker.prepare('   ')).rejects.toBeInstanceOf(AppError);
	});

	it('asks for four candidates', async () => {
		const generate = vi.fn(async () => ({ images: [Buffer.from('a')], seed: 3, device: 'webgpu' }));
		const maker = createEmojiMaker({ logger, translator, client: client(generate) });
		expect(await maker.draw('u1', 'cat')).toEqual({ images: [Buffer.from('a')], seed: 3 });
		expect(generate).toHaveBeenCalledWith('cat', { n: 4 });
	});

	it('lets one user draw one thing at a time', async () => {
		const pending: Array<() => void> = [];
		const generate = vi.fn(
			() =>
				new Promise<{ images: Buffer[]; seed: number; device: string }>((r) => pending.push(() => r({ images: [], seed: 0, device: 'cpu' })))
		);
		const maker = createEmojiMaker({ logger, translator, client: client(generate) });
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
				client: client(async () => {
					throw new MojiError(code, code);
				})
			});
			await expect(maker.draw('u1', 'cat')).rejects.toMatchObject({ kind });
		}
	});
});
