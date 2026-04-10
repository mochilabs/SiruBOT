export function buildInviteUrl({ redirect_url, guildId }: { redirect_url?: string, guildId?: string }) {
	const clientId = process.env.NEXT_PUBLIC_AUTH_DISCORD_ID;
	return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=274914929984&scope=bot%20applications.commands${redirect_url ? `&redirect_uri=${encodeURIComponent(redirect_url)}&response_type=code` : ""}${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ""}`;
}