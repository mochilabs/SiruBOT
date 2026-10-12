/** Build Discord CDN avatar URL */
export function discordAvatarUrl(userId: string, avatarHash: string, size = 128): string {
	return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${avatarHash.startsWith("a_") ? "gif" : "webp"}?size=${size}`;
}

/** Build Discord CDN guild icon URL */
export function discordGuildIconUrl(guildId: string, iconHash: string, size = 128): string {
	return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.webp?size=${size}`;
}
