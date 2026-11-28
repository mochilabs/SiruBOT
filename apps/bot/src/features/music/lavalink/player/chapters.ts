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
