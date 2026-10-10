/**
 * 멤버 인사 카드 렌더러 — 환영/작별 카드 1종 1200×675(16:9).
 * 배경은 브랜드 프리셋(코드로 그린 그라디언트)이나 업로드 dataURI(cover-fit)를 깔고
 * 그 위에 멤버 아바타(원형+링)와 제목·부제(템플릿 치환 결과)를 그려요.
 * 레이아웃 수치는 bot 리스너·dashboard 에디터 미리보기와 고정 계약이에요.
 */
import type { Canvas, CanvasDrawable, CanvasRenderingContext2D } from 'skia-canvas';
import { renderGreetingTemplate, type GreetingImage, type GreetingText } from '@sirubot/utils';
import { drawCircleImage, ensureKoreanFont, hexToRgba, loadImageAllowed, truncate } from './canvasUtils.ts';

const CARD_W = 1200;
const CARD_H = 675;
// 아바타 — 카드 중앙 x, 상단 20% 지점에 반지름 90px (카드/에디터 공용 계약값)
const AVATAR_RADIUS = 90;
const AVATAR_CY = Math.round(CARD_H * 0.2);
/** 텍스트 좌우 여백 — 카드 가장자리에 붙지 않게 */
const TEXT_MARGIN = 64;

/**
 * 배경을 코드로 그리는 프리셋 — DESIGN.md 브랜드 팔레트(로즈 핑크/플럼 다크/골드 secondary)의
 * 그라디언트라서 프리셋 자체가 브랜드 정체성이에요. 사진 배경이 아니라 브랜드 그라디언트를 제공하는 이유.
 */
const PRESET_BACKGROUNDS: Record<string, { base: string; from: string; to: string; glow: string }> = {
	rose: { base: '#3d2328', from: '#d1608a', to: '#ff85c1', glow: '#ffe4f0' },
	plum: { base: '#1a0e12', from: '#231317', to: '#4d2a35', glow: '#ffb3d9' },
	gold: { base: '#231a10', from: '#8a6a44', to: '#d4a574', glow: '#f0e2cf' }
};

/** 인사 배경 정규화/디코딩 실패 — 라우트가 400으로 매핑해요 (WeatherError/DeliveryError와 같은 패턴) */
export class GreetingBackgroundError extends Error {
	public constructor(
		public readonly identifier: string,
		message: string
	) {
		super(message);
		this.name = 'GreetingBackgroundError';
	}
}

/** dataURI에서 base64 본문만 떼어 Buffer로 — 손상 입력은 null (호출자가 폴백해요) */
export function decodeDataUri(dataUri: string): Buffer | null {
	const comma = dataUri.indexOf(',');
	if (comma < 0) return null;
	const buffer = Buffer.from(dataUri.slice(comma + 1), 'base64');
	return buffer.length > 0 ? buffer : null;
}

export interface GreetingCardContext {
	userId: string;
	displayName: string;
	/** 이미지 텍스트의 {서버} 토큰 — 호출자(봇)가 모르면 빈 문자열 */
	guildName: string;
	memberCount: number;
	avatarUrl: string | null;
}

/** 인사 카드 PNG — 봇 메시지 전송 경로와 같은 raw PNG Buffer */
export async function renderGreetingCard(image: GreetingImage, context: GreetingCardContext): Promise<Buffer> {
	const { Canvas } = await import('skia-canvas');
	await ensureKoreanFont();

	const canvas: Canvas = new Canvas(CARD_W, CARD_H);
	const ctx = canvas.getContext('2d');

	await drawGreetingBackground(ctx, image.background);
	if (image.showAvatar) {
		await drawGreetingAvatar(ctx, context);
	}
	drawGreetingText(ctx, image.title, context);
	drawGreetingText(ctx, image.subtitle, context);

	return (await canvas.toBuffer('png')) as Buffer;
}

/** 배경 — dataURI(cover-fit) 우선, 실패/부재 시 프리셋 + 로그 */
async function drawGreetingBackground(ctx: CanvasRenderingContext2D, background: GreetingImage['background']): Promise<void> {
	if (background.dataUri && (await drawUploadedBackground(ctx, background.dataUri))) return;
	if (background.dataUri) {
		// 깨진 업로드 배경으로 카드가 안 나오는 쪽이 더 나빠요 — 조용히 프리셋으로 폴백
		console.error('[data-api] greeting background dataUri is not decodable, falling back to preset');
	}
	const preset = (background.presetId && PRESET_BACKGROUNDS[background.presetId]) || PRESET_BACKGROUNDS.plum;
	drawPresetBackground(ctx, preset);
	// 그라디언트 위에서 흰 타이틀이 읽히도록 은은한 어두운 스크림
	ctx.fillStyle = 'rgba(26,14,18,0.32)';
	ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** 프리셋 배경 — 대각 그라디언트 + 코너 글로우 정도만 (장식 과잉 없이 브랜드 톤 유지) */
function drawPresetBackground(ctx: CanvasRenderingContext2D, preset: { base: string; from: string; to: string; glow: string }): void {
	ctx.fillStyle = preset.base;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
	const gradient = ctx.createLinearGradient(0, CARD_H, CARD_W, 0);
	gradient.addColorStop(0, preset.from);
	gradient.addColorStop(1, preset.to);
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
	const glow = ctx.createRadialGradient(CARD_W * 0.78, CARD_H * 0.22, 0, CARD_W * 0.78, CARD_H * 0.22, CARD_W * 0.55);
	glow.addColorStop(0, hexToRgba(preset.glow, 0.2));
	glow.addColorStop(1, hexToRgba(preset.glow, 0));
	ctx.fillStyle = glow;
	ctx.fillRect(0, 0, CARD_W, CARD_H);
}

/** 업로드 배경 — cover-fit으로 카드를 덮어요. 실패하면 false (호출자가 프리셋 폴백) */
async function drawUploadedBackground(ctx: CanvasRenderingContext2D, dataUri: string): Promise<boolean> {
	const buffer = decodeDataUri(dataUri);
	if (!buffer) return false;
	try {
		const { loadImage } = await import('skia-canvas');
		const img = (await loadImage(buffer)) as unknown as CanvasDrawable;
		const iw = (img as { width: number }).width;
		const ih = (img as { height: number }).height;
		if (!iw || !ih) return false;
		const scale = Math.max(CARD_W / iw, CARD_H / ih);
		ctx.drawImage(img, (CARD_W - iw * scale) / 2, (CARD_H - ih * scale) / 2, iw * scale, ih * scale);
		return true;
	} catch (error) {
		console.error(`[data-api] greeting background decode failed: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

/** 멤버 아바타 — 중앙 상단, 프로필 카드와 같은 브랜드 primary 링 */
async function drawGreetingAvatar(ctx: CanvasRenderingContext2D, context: GreetingCardContext): Promise<void> {
	const cx = CARD_W / 2;
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, AVATAR_CY, AVATAR_RADIUS + 6, 0, Math.PI * 2);
	ctx.fillStyle = '#ff85c1';
	ctx.fill();
	ctx.restore();

	const img = context.avatarUrl ? await loadImageAllowed(context.avatarUrl) : null;
	if (img) {
		drawCircleImage(ctx, img, cx, AVATAR_CY, AVATAR_RADIUS);
		return;
	}
	// 플레이스홀더 — 프로필 카드 폴백과 같은 톤
	ctx.save();
	ctx.beginPath();
	ctx.arc(cx, AVATAR_CY, AVATAR_RADIUS, 0, Math.PI * 2);
	ctx.fillStyle = '#35212a';
	ctx.fill();
	ctx.fillStyle = 'rgba(201,168,181,0.6)';
	ctx.font = '600 64px "Noto Sans KR", sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText('♪', cx, AVATAR_CY + 4);
	ctx.restore();
	ctx.textBaseline = 'alphabetic';
}

/** 제목/부제 — 카드 % 좌표(중앙 기준)에 그리고, 배경 대비를 위한 은은한 드롭 섀도 */
function drawGreetingText(ctx: CanvasRenderingContext2D, text: GreetingText, context: GreetingCardContext): void {
	// 이미지 카드에는 멘션을 못 그려요 — {유저}는 표시 이름으로 폴백해요 (renderGreetingTemplate 계약)
	const rendered = renderGreetingTemplate(text.text, {
		displayName: context.displayName,
		guildName: context.guildName,
		memberCount: context.memberCount
	});
	const x = (CARD_W * text.x) / 100;
	const y = (CARD_H * text.y) / 100;
	// x가 가장자리에 가까울 때 잘리지 않게 — 가까운 가장자리까지의 폭으로 제한
	const maxW = Math.max(120, 2 * Math.min(x, CARD_W - x) - TEXT_MARGIN);
	ctx.save();
	ctx.font = `${text.bold ? 700 : 500} ${text.size}px "Noto Sans KR", sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = text.color;
	ctx.shadowColor = 'rgba(0,0,0,0.45)';
	ctx.shadowBlur = Math.max(6, text.size / 4);
	ctx.shadowOffsetY = 2;
	ctx.fillText(truncate(ctx, rendered, maxW), x, y);
	ctx.restore();
}

// ── 배경 업로드 정규화 — 대시보드 업로드를 저장 규격으로 맞춰요 ──
// dataURI를 Prisma Json 컬럼에 통째로 저장하는 관계로, 저장 비용 상한이 필요해요.
// 문자 길이가 아니라 재인코딩 결과 바이너리 기준으로 판정해요.
const BG_MAX_SIDE = 1600;
const BG_MAX_BYTES = 900_000;
const BG_STEP_PX = 200;
const BG_MIN_SIDE = 320;
const BG_QUALITY = 0.82;

/**
 * 업로드 배경 축소·재인코딩 — 가장 긴 변 1600px, JPEG q0.82, 900KB 넘으면 200px씩 더 줄여요.
 * 리턴은 data:image/jpeg;base64,…
 */
export async function normalizeGreetingBackground(dataUri: string): Promise<string> {
	const raw = decodeDataUri(dataUri);
	if (!raw) {
		throw new GreetingBackgroundError('invalid_image', '이미지를 읽을 수 없어요 — PNG·JPEG·WEBP 파일로 다시 시도해 주세요.');
	}
	const { Canvas, loadImage } = await import('skia-canvas');
	let source: CanvasDrawable;
	try {
		source = (await loadImage(raw)) as unknown as CanvasDrawable;
	} catch {
		throw new GreetingBackgroundError('invalid_image', '이미지를 읽을 수 없어요 — PNG·JPEG·WEBP 파일로 다시 시도해 주세요.');
	}
	const iw = (source as { width: number }).width;
	const ih = (source as { height: number }).height;
	if (!iw || !ih) {
		throw new GreetingBackgroundError('invalid_image', '이미지를 읽을 수 없어요 — PNG·JPEG·WEBP 파일로 다시 시도해 주세요.');
	}

	// 첫 목표 — 가장 긴 변 1600px 이하
	let scale = Math.min(1, BG_MAX_SIDE / Math.max(iw, ih));
	for (;;) {
		const w = Math.max(1, Math.round(iw * scale));
		const h = Math.max(1, Math.round(ih * scale));
		const canvas: Canvas = new Canvas(w, h);
		const drawCtx = canvas.getContext('2d');
		drawCtx.drawImage(source, 0, 0, w, h);
		const encoded = await canvas.toBuffer('jpeg', { quality: BG_QUALITY });
		if (encoded.length <= BG_MAX_BYTES) {
			return `data:image/jpeg;base64,${encoded.toString('base64')}`;
		}
		const longest = Math.max(w, h);
		const nextLongest = longest - BG_STEP_PX;
		if (nextLongest < BG_MIN_SIDE) {
			throw new GreetingBackgroundError('image_too_large', '이미지를 충분히 줄일 수 없어요 — 더 작은 이미지로 시도해 주세요.');
		}
		scale = scale * (nextLongest / longest);
	}
}
