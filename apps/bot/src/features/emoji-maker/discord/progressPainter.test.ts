import { describe, expect, it, vi } from 'vitest';
import { createProgressPainter } from './progressPainter.ts';

describe('createProgressPainter', () => {
	it('drops frames that come too soon or while an edit is in flight, but never forced ones', async () => {
		let clock = 0;
		const painted: string[] = [];
		let release!: () => void;
		const painter = createProgressPainter({ minIntervalMs: 800, now: () => clock });
		const edit =
			(name: string, wait = false) =>
			() =>
				new Promise<void>((resolve) => {
					painted.push(name);
					if (wait) release = resolve;
					else resolve();
				});

		painter.paint(edit('stage-1', true), { force: true });
		await Promise.resolve();
		painter.paint(edit('frame-a')); // 편집 중 → 버림
		clock = 900;
		painter.paint(edit('frame-b')); // 아직 편집 중 → 버림
		painter.paint(edit('stage-2'), { force: true }); // 앞 편집 뒤에 이어서
		release();
		await painter.settle();
		expect(painted).toEqual(['stage-1', 'stage-2']);

		clock = 1000;
		painter.paint(edit('frame-c')); // 마지막 시작(900)에서 100ms → 버림
		clock = 1800;
		painter.paint(edit('frame-d'));
		await painter.settle();
		expect(painted).toEqual(['stage-1', 'stage-2', 'frame-d']);
	});

	it('reports edit failures without breaking the chain', async () => {
		const onError = vi.fn();
		const painter = createProgressPainter({ minIntervalMs: 0, onError });
		painter.paint(() => Promise.reject(new Error('429')), { force: true });
		const after = vi.fn(async () => {});
		painter.paint(after, { force: true });
		await painter.settle();
		expect(onError).toHaveBeenCalledOnce();
		expect(after).toHaveBeenCalledOnce();
	});
});
