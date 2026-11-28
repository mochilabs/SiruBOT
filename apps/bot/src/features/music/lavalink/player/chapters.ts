import type { CustomPlayer } from './customPlayer.ts';

export function currentChapterIndex(player: CustomPlayer): number | null {
	const chapters = player.chapters;
	if (!Array.isArray(chapters) || chapters.length === 0) return null;
	if (typeof player.position !== 'number') return null;
	const position = player.position;
	const index = chapters.findIndex((chapter) => position >= chapter.start && position < chapter.end);
	return index >= 0 ? index : null;
}

export function currentChapter(player: CustomPlayer): { name: string; start: number; end: number; duration: number } | null {
	const index = currentChapterIndex(player);
	if (index === null) return null;
	const chapter = player.chapters[index]!;
	const duration = chapter.duration || chapter.end - chapter.start;
	return { name: chapter.name, start: chapter.start, end: chapter.end, duration };
}

/** 챕터 셀렉트 값(`index:startMs`)을 지금 챕터 목록과 맞춰 이동할 위치로 바꿔요. 곡이 바뀌어 맞지 않으면 null. */
export function chapterStartFromPick(chapters: readonly { start: number }[], value: string): number | null {
	const match = /^(\d+):(\d+)$/.exec(value);
	if (!match) return null;
	const chapter = chapters[Number(match[1])];
	return chapter && chapter.start === Number(match[2]) ? chapter.start : null;
}
