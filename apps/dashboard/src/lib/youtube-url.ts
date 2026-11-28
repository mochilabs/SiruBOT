const YOUTUBE_URL_PATTERN = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;

export function isYoutubeUrl(value: string): boolean {
	return YOUTUBE_URL_PATTERN.test(value.trim());
}

export function extractYoutubeVideoId(value: string): string | null {
	const match = value.trim().match(YOUTUBE_URL_PATTERN);
	return match ? match[1] : null;
}
