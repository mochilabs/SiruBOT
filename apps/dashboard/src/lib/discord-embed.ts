/**
 * Discord 링크 미리보기용 컴포넌트 임베드 페이로드 빌더예요.
 * 규격: https://docs.discord.com/developers/link-previews/component-embeds
 * - 서버 렌더 마크업의 <head>에 있어야 하고(크롤러는 JS를 실행하지 않아요), 페이로드는 3,000바이트 이하여야 해요.
 * - 버튼은 링크 스타일(style 5)만 허용되고, 허용 키 외의 값이 있으면 페이로드 전체가 무효예요.
 * - 실패하면 Discord가 Open Graph 메타로 대체하므로 metadata(openGraph)는 그대로 둬요.
 */

import { OG_IMAGES } from "@/lib/site-metadata";

export const DISCORD_EMBED_MAX_BYTES = 3000;
/** 다크 테마 --brand(#f98aa0)와 같은 색이에요 */
const ACCENT_COLOR = 0xf98aa0;
const LINK_BUTTON_STYLE = 5;

export interface DiscordEmbedButton {
	label: string;
	url: string;
	/** 유니코드 이모지 하나 — 버튼 라벨 앞에 붙어요 */
	emoji?: string;
}

export interface DiscordEmbedInput {
	title: string;
	description: string;
	/** 절대 URL — 제목 링크에 쓰여요 */
	url: string;
	/** 제목 위 작은 줄(-# 서브텍스트) */
	eyebrow?: string;
	/** 절대 URL 이미지 — 제목 오른쪽 썸네일로 보여줘요 */
	thumbnailUrl?: string;
	/** 절대 URL 이미지 — 본문 아래 큰 이미지로 보여줘요 */
	imageUrl?: string;
	imageAlt?: string;
	/** 이미지 아래 짧은 특징 줄 — 한 줄에 하나씩 보여줘요 */
	highlights?: string[];
	buttons: DiscordEmbedButton[];
}

/**
 * 요청이 들어온 origin을 돌려줘요. NEXT_PUBLIC_APP_URL은 빌드 시점에 인라인되는데 Docker 빌드에서는 설정되지 않아
 * localhost로 굳어요. Discord는 링크와 이미지가 페이지와 같은 도메인이어야 읽으므로 요청 헤더를 우선해요.
 */
export function getRequestOrigin(headers: { get(name: string): string | null }) {
	const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
	if (!host || !/^[a-z0-9.-]+(:\d+)?$/i.test(host)) return getAppBaseUrl();
	// 프록시가 proto를 http로 넘겨도 공개 도메인은 https로 서비스되므로, 로컬 호스트만 http로 둬요
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

/** 크롤러가 HTML 안에서 읽는 크기와 같게, `<`·`>`·`&`는 이스케이프(\uXXXX, 6바이트)한 뒤 바이트 수를 세요 */
export function serializeDiscordEmbed(payload: ReturnType<typeof buildDiscordEmbed>) {
	const json = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`);
	if (Buffer.byteLength(json, "utf8") > DISCORD_EMBED_MAX_BYTES) {
		throw new Error(`Discord 컴포넌트 임베드가 ${DISCORD_EMBED_MAX_BYTES}바이트를 넘었어요`);
	}
	return json;
}

/** 페이지별 임베드 정의 — 키는 /embeds/<key>.json 경로와 DiscordEmbedLink의 name이에요 */
export function getDiscordEmbedInput(name: string, base: string): DiscordEmbedInput | null {
	const thumbnailUrl = `${base}/images/siru-profile.png`;
	const invite = { label: "봇 초대하기", url: `${base}/invite`, emoji: "➕" };
	const dashboard = { label: "대시보드", url: `${base}/servers`, emoji: "🛠️" };
	const chart = { label: "음악 차트", url: `${base}/track`, emoji: "📈" };

	switch (name) {
		case "home":
			return {
				eyebrow: "Discord 음악·AI 봇",
				title: "음악부터 AI까지, 시루봇 하나면 돼요",
				description: "명령어는 Discord에서, 설정은 웹 대시보드에서. 서버에 맞게 골라 쓰는 음악·AI 봇이에요.",
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
					"🎛️ **필터 프리셋** 베이스부스트·나이트코어·8D·노래방",
					"📝 **가사** 듣고 있는 곡 가사 바로 보기"
				],
				buttons: [{ ...chart, label: "차트 보기" }, invite, dashboard]
			};
		default:
			return null;
	}
}
