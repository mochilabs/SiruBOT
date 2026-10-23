export function discordGuildIconUrl(guildId: string, iconHash: string, size = 128): string {
	return `https://cdn.discordapp.com/icons/${guildId}/${iconHash}.webp?size=${size}`;
}
