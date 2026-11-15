import type { CustomPlayer } from './customPlayer.ts';

/** 현재 위치 기준 재생 중인 챕터 인덱스 — 챕터가 없거나 경계 밖이면 null */
export function currentChapterIndex(player: CustomPlayer): number | null {
	const chapters = player.chapters;
	if (!Array.isArray(chapters) || chapters.length === 0) return null;
	if (typeof player.position !== 'number') return null;
	const position = player.position;
	const index = chapters.findIndex((chapter) => position >= chapter.start && position < chapter.end);
	return index >= 0 ? index : null;
}

/** 현재 재생 중인 챕터 객체 — 챕터가 없으면 null */
export function currentChapter(player: CustomPlayer): { name: string; start: number; end: number; duration: number } | null {
	const index = currentChapterIndex(player);
	if (index === null) return null;
	const chapter = player.chapters[index]!;
	// duration 필드가 없는 소스(SponsorBlock 등)도 있으니 end-start로 폴백한다.
	const duration = chapter.duration || chapter.end - chapter.start;
	return { name: chapter.name, start: chapter.start, end: chapter.end, duration };
}
