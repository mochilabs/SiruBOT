export function buildInviteUrl({ redirect_url, guildId }: { redirect_url?: string, guildId?: string }) {
	const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
	return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=274914929984&scope=bot%20applications.commands${redirect_url ? `&redirect_uri=${encodeURIComponent(redirect_url)}&response_type=code` : ""}${guildId ? `&guild_id=${guildId}&disable_guild_select=true` : ""}`;
}

/** 라바링크 소스 이름을 표시용 라벨로 바꿔요 — 모르는 소스는 원문을 그대로 돌려줘요 */
const SOURCE_LABELS: Record<string, string> = {
	"youtube-file-cache": "Youtube",
	youtube: "Youtube",
	youtubemusic: "Youtube Music",
	"youtube-music": "Youtube Music",
	spotify: "Spotify",
	soundcloud: "SoundCloud",
};

export function prettySourceName(sourceName: string) {
	return SOURCE_LABELS[sourceName.toLowerCase().trim()] ?? sourceName;
}
