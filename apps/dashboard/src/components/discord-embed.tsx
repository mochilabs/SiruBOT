import { headers } from "next/headers";

import { getRequestOrigin } from "@/lib/discord-embed";

/**
 * React가 <link>를 <head>로 끌어올리므로 어디서든 렌더 가능(인라인 <script>는 불가).
 * 요청 헤더의 origin으로 동적 렌더링한다.
 */
export async function DiscordEmbedLink({ name }: { name: string }) {
	const origin = getRequestOrigin(await headers());
	return <link rel="discord:component-embed" type="application/json" href={`${origin}/embeds/${name}.json`} />;
}
