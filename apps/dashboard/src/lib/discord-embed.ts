import { OG_IMAGES } from "@/lib/site-metadata";

export const DISCORD_EMBED_MAX_BYTES = 3000;
const ACCENT_COLOR = 0xf98aa0;
const LINK_BUTTON_STYLE = 5;

export interface DiscordEmbedButton {
	label: string;
	url: string;
	emoji?: string;
}

export interface DiscordEmbedInput {
	title: string;
	description: string;
	url: string;
	eyebrow?: string;
	thumbnailUrl?: string;
	imageUrl?: string;
	imageAlt?: string;
	highlights?: string[];
	buttons: DiscordEmbedButton[];
}

// NEXT_PUBLIC_APP_URL is inlined at build time; prefer request headers for the runtime domain.
export function getRequestOrigin(headers: { get(name: string): string | null }) {
	const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
	if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return getAppBaseUrl();
	// Assume https for non-local hosts even when a reverse proxy forwards http.
	const proto = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host) ? "http" : "https";
	return `${proto}://${host}`;
}

function getAppBaseUrl() {
	return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function buildDiscordEmbed({ title, description, url, eyebrow, thumbnailUrl, imageUrl, imageAlt, highlights, buttons }: DiscordEmbedInput) {
	const heading = { type: 10, content: `${eyebrow ? `-# ${eyebrow}\n` : ""}## [${title}](${url})\n${description}` };
	const components: unknown[] = [
		thumbnailUrl ? { type: 9, components: [heading], accessory: { type: 11, media: { url: thumbnailUrl } } } : heading
	];

	if (imageUrl) {
		components.push({ type: 12, items: [{ media: { url: imageUrl }, ...(imageAlt ? { description: imageAlt } : {}) }] });
	}

	if (highlights?.length) {
		components.push({ type: 10, content: highlights.join("\n") });
	}

	if (buttons.length > 0) {
		components.push({ type: 14, spacing: 1 });
		components.push({
			type: 1,
			components: buttons.slice(0, 5).map(({ label, url: href, emoji }) => ({
				type: 2,
				style: LINK_BUTTON_STYLE,
				label,
				url: href,
				...(emoji ? { emoji: { name: emoji } } : {})
			}))
		});
	}

	return { component: { type: 17, accent_color: ACCENT_COLOR, components } };
}

// Escape <, >, &, and line separators to match the byte length read by crawlers in HTML.
export function serializeDiscordEmbed(payload: ReturnType<typeof buildDiscordEmbed>) {
	const json = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
	if (Buffer.byteLength(json, "utf8") > DISCORD_EMBED_MAX_BYTES) {
		throw new Error(`Discord 컴포넌트 임베드가 ${DISCORD_EMBED_MAX_BYTES}바이트를 넘었어요`);
	}
	return json;
}

export function getDiscordEmbedInput(name: string, base: string): DiscordEmbedInput | null {
	const thumbnailUrl = `${base}/images/siru-profile.png`;
	const invite = { label: "봇 초대하기", url: `${base}/invite`, emoji: "➕" };
	const dashboard = { label: "대시보드", url: `${base}/servers`, emoji: "🛠️" };
	const chart = { label: "음악 차트", url: `${base}/track`, emoji: "📈" };

	switch (name) {
		case "home":
			return {
				eyebrow: "한국어 커뮤니티 올인원 봇",
				title: "음악부터 AI까지, 시루봇 하나면 돼요",
				description: "명령어는 Discord에서, 설정은 웹 대시보드에서. 한국어 커뮤니티를 위한 올인원 봇이에요.",
				url: base,
				thumbnailUrl,
				imageUrl: `${base}${OG_IMAGES.home.url}`,
				imageAlt: OG_IMAGES.home.alt,
				highlights: ["🎵 **음악** 고음질 재생, 대기열, 웹 플레이어", "💬 **AI** 채팅과 TTS로 대화하기", "🛠️ **관리** 웹 대시보드에서 서버 설정"],
				buttons: [invite, dashboard, chart]
			};
		case "invite":
			return {
				eyebrow: "봇 초대",
				title: "내 서버에 시루봇을 초대해요",
				description: "음악 신청과 대기열 관리, 웹 플레이어까지 초대 한 번으로 바로 쓸 수 있어요.",
				url: `${base}/invite`,
				thumbnailUrl,
				imageUrl: `${base}${OG_IMAGES.invite.url}`,
				imageAlt: OG_IMAGES.invite.alt,
				buttons: [invite, dashboard]
			};
		case "track":
			return {
				eyebrow: "음악 차트",
				title: "지금 뜨는 음악, 바로 재생해요",
				description: "차트에서 고른 곡을 버튼 한 번으로 틀고, 곡 사이는 끊김 없이 자연스럽게 이어 들어요.",
				url: `${base}/track`,
				thumbnailUrl,
				imageUrl: `${base}${OG_IMAGES.track.url}`,
				imageAlt: OG_IMAGES.track.alt,
				highlights: [
					"🎚️ **크로스페이드·갭리스** 곡과 곡 사이를 매끄럽게",
					"📝 **가사** 듣고 있는 곡 가사 바로 보기"
				],
				buttons: [{ ...chart, label: "차트 보기" }, invite, dashboard]
			};
		default:
			return null;
	}
}
