import { buildDiscordEmbed, type DiscordEmbedInput, serializeDiscordEmbed } from "@/lib/discord-embed";

/** 페이지/레이아웃에서 렌더하면 Discord 링크 미리보기용 컴포넌트 임베드 페이로드가 HTML에 실려요 */
export function DiscordEmbed(input: DiscordEmbedInput) {
	const json = serializeDiscordEmbed(buildDiscordEmbed(input));
	return <script id="discord:component-embed" type="application/json" dangerouslySetInnerHTML={{ __html: json }} />;
}
