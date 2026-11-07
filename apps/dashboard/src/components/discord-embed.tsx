import { getAppBaseUrl } from "@/lib/discord-embed";

/**
 * Discord 링크 미리보기용 컴포넌트 임베드 링크예요. React가 <link>를 <head>로 끌어올리므로
 * 페이지·레이아웃 어디서든 렌더할 수 있어요(인라인 <script>는 <head>로 올라가지 않아 쓰지 않아요).
 * 페이로드는 app/embeds/[name]/route.ts가 내려줘요.
 */
export function DiscordEmbedLink({ name }: { name: string }) {
	return <link rel="discord:component-embed" type="application/json" href={`${getAppBaseUrl()}/embeds/${name}.json`} />;
}
