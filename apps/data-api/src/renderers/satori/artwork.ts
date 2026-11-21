/**
 * 아트워크 처리 — 썸네일에서 레터박스를 잘라낸 정사각 이미지, 카드 배경용 초소형 이미지, 대표색을 뽑아요.
 * Takumi의 SVG `<image>` 래스터로 처리해서 skia·sharp·resvg 없이 동작해요 (node 전용).
 * 색·크기 계산 같은 순수 헬퍼는 `@sirubot/cards`에 있어요.
 */
import { BACKDROP_SIZE, type CropBox, detectContentBounds, dominantColor, imageSizeOf, normalizeAccent, type PreparedArtwork } from '@sirubot/cards';
import { renderSvgRaster } from './satoriKit.ts';

export type { PreparedArtwork } from '@sirubot/cards';

/** 160x100 기준 가우시안 표준편차 — 카드 폭(960)에서 약 6배 크기로 보여요 */
const BACKDROP_BLUR = 6;
const PROBE_WIDTH = 96;

/** data URI를 `<image>`로 넣은 SVG를 만들어요 — 자르기·축소·확대를 한꺼번에 해줘요. */
function imageSvg(
	uri: string,
	attrs: { width: number; height: number; viewBox?: string; aspect: string },
	image: { width: number; height: number }
): string {
	const viewBox = attrs.viewBox ? ` viewBox="${attrs.viewBox}"` : '';
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${attrs.width}" height="${attrs.height}"${viewBox} preserveAspectRatio="${attrs.aspect}">` +
		`<image href="${uri}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></svg>`
	);
}

/** 배경용 SVG — 이미지를 캔버스보다 조금 크게 깔고 블러해서 가장자리가 투명하게 번지지 않게 해요. */
function backdropSvg(uri: string, viewBox: string, image: { width: number; height: number }): string {
	const { width, height } = BACKDROP_SIZE;
	const m = BACKDROP_BLUR * 3;
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
		`<defs><filter id="b" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="${BACKDROP_BLUR}"/></filter></defs>` +
		`<svg x="${-m}" y="${-m}" width="${width + m * 2}" height="${height + m * 2}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" filter="url(#b)">` +
		`<image href="${uri}" x="0" y="0" width="${image.width}" height="${image.height}" preserveAspectRatio="none"/></svg></svg>`
	);
}

const toDataUri = (png: Uint8Array) => `data:image/png;base64,${Buffer.from(png).toString('base64')}`;

/**
 * 썸네일 data URI에서 카드용 이미지 3종을 만들어요. 읽을 수 없는 이미지면 null이라 호출부가 폴백 배경을 그려요.
 * @param artSize 정사각 아트워크 한 변(px)
 */
export async function prepareArtwork(dataUri: string | null, artSize: number): Promise<PreparedArtwork | null> {
	if (!dataUri) return null;
	try {
		// 1) 자연 크기 — 헤더만 읽어요 (디코딩 없음)
		const comma = dataUri.indexOf(',');
		const size = comma < 0 ? null : imageSizeOf(Buffer.from(dataUri.slice(comma + 1), 'base64'));
		if (!size || size.width < 4 || size.height < 4) return null;
		const { width: nw, height: nh } = size;

		// 2) 가장자리 검은 띠 감지용 초소형 래스터 (비율 유지, 너비 96)
		const pw = Math.min(PROBE_WIDTH, nw);
		const ph = Math.max(4, Math.round((pw * nh) / nw));
		const probePixels = await renderSvgRaster(
			imageSvg(dataUri, { width: pw, height: ph, aspect: 'none' }, { width: pw, height: ph }),
			pw,
			ph,
			'raw'
		);
		// 디코딩에 실패한 이미지(미지원 형식 등)는 아무것도 안 그려서 알파가 전부 0이에요.
		let visible = false;
		for (let i = 3; i < probePixels.length; i += 4)
			if (probePixels[i]! > 0) {
				visible = true;
				break;
			}
		if (!visible) return null;

		const bounds = detectContentBounds(probePixels, pw, ph);
		const crop: CropBox = {
			sx: (bounds.left / pw) * nw,
			sy: (bounds.top / ph) * nh,
			sw: ((bounds.right - bounds.left) / pw) * nw,
			sh: ((bounds.bottom - bounds.top) / ph) * nh
		};
		const viewBox = `${crop.sx} ${crop.sy} ${crop.sw} ${crop.sh}`;

		// 3) 정사각 아트워크 + 블러 배경(PNG·대표색용 RGBA)을 병렬로 래스터해요.
		const backSvg = backdropSvg(dataUri, viewBox, { width: nw, height: nh });
		const [artPng, backdropPng, backdropPixels] = await Promise.all([
			renderSvgRaster(
				imageSvg(dataUri, { width: artSize, height: artSize, viewBox, aspect: 'xMidYMid slice' }, { width: nw, height: nh }),
				artSize,
				artSize,
				'png'
			),
			renderSvgRaster(backSvg, BACKDROP_SIZE.width, BACKDROP_SIZE.height, 'png'),
			renderSvgRaster(backSvg, BACKDROP_SIZE.width, BACKDROP_SIZE.height, 'raw')
		]);
		const dominant = dominantColor(backdropPixels);
		return { art: toDataUri(artPng), backdrop: toDataUri(backdropPng), accent: dominant ? normalizeAccent(dominant) : null };
	} catch {
		return null;
	}
}
