export function isYouTubeSource(sourceName: string | null | undefined): boolean {
	return Boolean(sourceName?.startsWith('youtube'));
}

export function resolveYouTubeVideoId(track: { info?: { sourceName?: string; identifier?: string } } | null | undefined): string | null {
	if (!track?.info || !isYouTubeSource(track.info.sourceName)) return null;
	const identifier = track.info.identifier;
	return identifier && identifier.length > 0 ? identifier : null;
}
