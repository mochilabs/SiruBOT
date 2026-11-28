import type { LyricsResult } from '../../../../services/dataApiClient.ts';

export type LyricsViewMode = 'original' | 'translation' | 'both';

/** Discord 텍스트 표시 한도(4000)에서 제목 줄 여유를 뺀 값 */
export const LYRICS_MAX_LENGTH = 3800;

function stripTimestamps(text: string): string {
	return text.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '');
}

export function lyricsBody(result: Pick<LyricsResult, 'plainLyrics' | 'syncedLyrics'>): string {
	return result.plainLyrics ?? stripTimestamps(result.syncedLyrics ?? '');
}

export function hasTranslation(result: Pick<LyricsResult, 'translation'>): boolean {
	return result.translation?.status === 'ready' && Object.keys(result.translation.lines ?? {}).length > 0;
}

export function buildLyricsText(result: Pick<LyricsResult, 'plainLyrics' | 'syncedLyrics' | 'translation'>, mode: LyricsViewMode): string {
	const body = lyricsBody(result);
	const lines = hasTranslation(result) ? result.translation!.lines! : null;
	let text = body;
	if (lines && mode !== 'original') {
		text = body
			.split(/\r?\n/)
			.map((line) => {
				const translated = lines[line.trim()];
				if (!translated || translated === line.trim()) return line;
				return mode === 'translation' ? translated : `${line}\n-# ${translated}`;
			})
			.join('\n');
	}
	if (text.length > LYRICS_MAX_LENGTH) text = `${text.substring(0, LYRICS_MAX_LENGTH)}\n\n*... (가사가 너무 길어 잘렸어요)*`;
	return text;
}
