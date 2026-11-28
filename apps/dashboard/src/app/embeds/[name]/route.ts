import { buildDiscordEmbed, getDiscordEmbedInput, getRequestOrigin, serializeDiscordEmbed } from "@/lib/discord-embed";

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
	const { name } = await params;
	const input = getDiscordEmbedInput(name.replace(/\.json$/, ""), getRequestOrigin(req.headers));
	if (!input) return new Response("Not Found", { status: 404 });

	return new Response(serializeDiscordEmbed(buildDiscordEmbed(input)), {
		headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" }
	});
}
