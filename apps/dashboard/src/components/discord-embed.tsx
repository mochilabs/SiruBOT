import { headers } from "next/headers";

import { getRequestOrigin } from "@/lib/discord-embed";

/**
 * Discord 링크 미리보기용 컴포넌트 임베드 링크예요. React가 <link>를 <head>로 끌어올리므로
 * 페이지·레이아웃 어디서든 렌더할 수 있어요(인라인 <script>는 <head>로 올라가지 않아 쓰지 않아요).
 * href는 페이지와 같은 도메인이어야 해서 요청 헤더의 origin으로 만들어요(이 페이지는 동적 렌더링이 돼요).
 * 페이로드는 app/embeds/[name]/route.ts가 내려줘요.
 */
export async function DiscordEmbedLink({ name }: { name: string }) {
	const origin = getRequestOrigin(await headers());
	return <link rel="discord:component-embed" type="application/json" href={`${origin}/embeds/${name}.json`} />;
}
