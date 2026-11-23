import type { LyricsResult } from '../../../../services/dataApiClient.ts';

export type LyricsViewMode = 'original' | 'translation' | 'both';

/** Discord 텍스트 표시 한도(4000)에서 제목 줄 여유를 뺀 값 */
export const LYRICS_MAX_LENGTH = 3800;

/** 싱크 가사의 타임스탬프를 지워 본문만 남겨요 */
function stripTimestamps(text: string): string {
	return text.replace(/\[\d{2}:\d{2}\.\d{2,3}\]\s*/g, '');
}

/** 가사 본문 — 일반 가사를 우선하고, 없으면 싱크 가사에서 타임스탬프를 지워 써요 */
export function lyricsBody(result: Pick<LyricsResult, 'plainLyrics' | 'syncedLyrics'>): string {
	return result.plainLyrics ?? stripTimestamps(result.syncedLyrics ?? '');
}

/** 번역이 준비됐는지 — 줄이 하나라도 있어야 해요 */
export function hasTranslation(result: Pick<LyricsResult, 'translation'>): boolean {
	return result.translation?.status === 'ready' && Object.keys(result.translation.lines ?? {}).length > 0;
}

/**
 * 보기 방식에 맞춘 가사 문자열 — 번역이 없는 줄은 원문 그대로 둬요.
 * both: 원문 줄 아래에 번역을 `-#` 작은 글씨로 붙여요.
 */
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
