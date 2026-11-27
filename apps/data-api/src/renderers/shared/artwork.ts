import { BACKDROP_SIZE, type CropBox, detectContentBounds, dominantColor, imageSizeOf, normalizeAccent, type PreparedArtwork } from '@sirubot/cards';
import { renderSvgRaster } from './takumiKit.tsx';

export type { PreparedArtwork } from '@sirubot/cards';

const BACKDROP_BLUR = 6;
const PROBE_WIDTH = 96;

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

export async function prepareArtwork(dataUri: string | null, artSize: number): Promise<PreparedArtwork | null> {
	if (!dataUri) return null;
	try {
		const comma = dataUri.indexOf(',');
		const size = comma < 0 ? null : imageSizeOf(Buffer.from(dataUri.slice(comma + 1), 'base64'));
		if (!size || size.width < 4 || size.height < 4) return null;
		const { width: nw, height: nh } = size;

		const pw = Math.min(PROBE_WIDTH, nw);
		const ph = Math.max(4, Math.round((pw * nh) / nw));
		const probePixels = await renderSvgRaster(
			imageSvg(dataUri, { width: pw, height: ph, aspect: 'none' }, { width: pw, height: ph }),
			pw,
			ph,
			'raw'
		);
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
