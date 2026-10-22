import type { CanvasRenderingContext2D } from 'skia-canvas';
import { describe, expect, it, vi } from 'vitest';
import { ensureKoreanFont, getPath2DConstructor } from './fonts.ts';
import { drawIcon, type IconName } from './icons.ts';

/** 드로잉 호출을 기록하는 가짜 컨텍스트 */
function recordingCtx() {
	const ctx = {
		save: vi.fn(),
		restore: vi.fn(),
		translate: vi.fn(),
		scale: vi.fn(),
		beginPath: vi.fn(),
		roundRect: vi.fn(),
		arc: vi.fn(),
		fill: vi.fn(),
		stroke: vi.fn(),
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 0,
		lineCap: '',
		lineJoin: ''
	};
	return Object.assign(ctx, { asCanvas: ctx as unknown as CanvasRenderingContext2D });
}

describe('drawIcon', () => {
	it('ensureKoreanFont 전에는 Path2D 미설정이라 아무것도 그리지 않아요', () => {
		expect(getPath2DConstructor()).toBeNull();
		const ctx = recordingCtx();
		drawIcon(ctx.asCanvas, 'music', 10, 20, 24, '#ffffff');
		expect(ctx.save).not.toHaveBeenCalled();
		expect(ctx.stroke).not.toHaveBeenCalled();
	});

	it('ensureKoreanFont 후에는 Path2D 싱글턴으로 경로를 그려요', async () => {
		await ensureKoreanFont();
		expect(getPath2DConstructor()).not.toBeNull();

		const ctx = recordingCtx();
		drawIcon(ctx.asCanvas, 'music', 10, 20, 24, '#ffffff');
		// music = subpath 1개 + 원 2개
		expect(ctx.save).toHaveBeenCalledOnce();
		expect(ctx.restore).toHaveBeenCalledOnce();
		expect(ctx.translate).toHaveBeenCalledWith(10, 20);
		expect(ctx.scale).toHaveBeenCalledWith(1, 1);
		expect(ctx.stroke).toHaveBeenCalledTimes(3);
		expect(ctx.arc).toHaveBeenCalledTimes(2);
		expect(ctx.arc).toHaveBeenCalledWith(6, 18, 3, 0, Math.PI * 2);
		expect(ctx.strokeStyle).toBe('#ffffff');
		expect(ctx.lineWidth).toBe(2);
	});

	it('size를 24로 나눈 비율로 좌표계를 줄여요', async () => {
		await ensureKoreanFont();
		const ctx = recordingCtx();
		drawIcon(ctx.asCanvas, 'pause', 0, 0, 12, '#ffffff');
		expect(ctx.scale).toHaveBeenCalledWith(0.5, 0.5);
	});

	it('fill 옵션은 경로를 채우고 strokeWidth를 그대로 써요', async () => {
		await ensureKoreanFont();
		const ctx = recordingCtx();
		drawIcon(ctx.asCanvas, 'pause', 0, 0, 24, '#ff3b5c', { fill: true, strokeWidth: 4 });
		// pause = subpath 2개(원 없음)
		expect(ctx.fill).toHaveBeenCalledTimes(2);
		expect(ctx.stroke).not.toHaveBeenCalled();
		expect(ctx.fillStyle).toBe('#ff3b5c');
	});

	it('rect 아이콘은 roundRect로 테두리를 그려요', async () => {
		await ensureKoreanFont();
		const ctx = recordingCtx();
		drawIcon(ctx.asCanvas, 'calendar', 0, 0, 24, '#ffffff');
		expect(ctx.roundRect).toHaveBeenCalledWith(3, 4, 18, 18, 2);
		// calendar = subpath 3개 + rect 1개
		expect(ctx.stroke).toHaveBeenCalledTimes(4);
	});

	it('정의되지 않은 아이콘 이름이면 조용히 넘어가요', async () => {
		await ensureKoreanFont();
		const ctx = recordingCtx();
		drawIcon(ctx.asCanvas, 'no-such-icon' as IconName, 0, 0, 24, '#ffffff');
		expect(ctx.save).not.toHaveBeenCalled();
	});
});
