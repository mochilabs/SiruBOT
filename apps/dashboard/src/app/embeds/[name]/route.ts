import { buildDiscordEmbed, getDiscordEmbedInput, getRequestOrigin, serializeDiscordEmbed } from "@/lib/discord-embed";

/** Discord 크롤러(Discordbot/2.0)가 가져가는 컴포넌트 임베드 JSON — GET /embeds/<name>.json */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
	const { name } = await params;
	const input = getDiscordEmbedInput(name.replace(/\.json$/, ""), getRequestOrigin(req.headers));
	if (!input) return new Response("Not Found", { status: 404 });

	return new Response(serializeDiscordEmbed(buildDiscordEmbed(input)), {
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" }
	});
}
