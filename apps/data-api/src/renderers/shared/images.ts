// SSRF allowlist: Discord CDN and YouTube thumbnails only.
const IMAGE_ALLOW_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net', 'i.ytimg.com', 'img.youtube.com', 'yt3.ggpht.com']);

export function isAllowedImageUrl(url: string): boolean {
	try {
		const u = new URL(url);
		if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
		return IMAGE_ALLOW_HOSTS.has(u.hostname.toLowerCase());
	} catch {
		return false;
	}
}
