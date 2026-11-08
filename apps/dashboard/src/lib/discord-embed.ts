/**
 * Discord 링크 미리보기용 컴포넌트 임베드 페이로드 빌더예요.
 * 규격: https://docs.discord.com/developers/link-previews/component-embeds
 * - 서버 렌더 마크업의 <head>에 있어야 하고(크롤러는 JS를 실행하지 않아요), 페이로드는 3,000바이트 이하여야 해요.
 * - 버튼은 링크 스타일(style 5)만 허용되고, 허용 키 외의 값이 있으면 페이로드 전체가 무효예요.
 * - 실패하면 Discord가 Open Graph 메타로 대체하므로 metadata(openGraph)는 그대로 둬요.
 */

export const DISCORD_EMBED_MAX_BYTES = 3000;
const ACCENT_COLOR = 0xf08a8a;
const LINK_BUTTON_STYLE = 5;

export interface DiscordEmbedButton {
	label: string;
	url: string;
}

export interface DiscordEmbedInput {
	title: string;
	description: string;
	/** 절대 URL — 제목 링크와 우측 버튼에 쓰여요 */
	url: string;
	/** 절대 URL 이미지 — 본문 아래 큰 이미지로 보여줘요 */
	imageUrl?: string;
	imageAlt?: string;
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

export function getAppBaseUrl() {
	return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function buildDiscordEmbed({ title, description, url, imageUrl, imageAlt, buttons }: DiscordEmbedInput) {
	const components: unknown[] = [
		{ type: 10, content: `# [${title}](${url})\n${description}` }
	];

	if (imageUrl) {
		components.push({ type: 12, items: [{ media: { url: imageUrl }, ...(imageAlt ? { description: imageAlt } : {}) }] });
	}

	if (buttons.length > 0) {
		components.push({ type: 14, spacing: 1 });
		components.push({
			type: 1,
			components: buttons.slice(0, 5).map(({ label, url: href }) => ({ type: 2, style: LINK_BUTTON_STYLE, label, url: href }))
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

const DESCRIPTION = "음악 재생부터 AI 채팅, 서버 관리까지. 시루봇 하나로 Discord를 더 편리하게 즐겨보세요.";

/** 페이지별 임베드 정의 — 키는 /embeds/<key>.json 경로와 DiscordEmbedLink의 name이에요 */
export function getDiscordEmbedInput(name: string, base: string): DiscordEmbedInput | null {
	const imageUrl = `${base}/images/og-image.png`;
	const invite = { label: "봇 초대하기", url: `${base}/invite` };
	const dashboard = { label: "대시보드 가기", url: `${base}/servers` };

	switch (name) {
		case "home":
			return {
				title: "시루봇",
				description: DESCRIPTION,
				url: base,
				imageUrl,
				imageAlt: "시루봇",
				buttons: [invite, dashboard, { label: "음악 차트", url: `${base}/track` }]
			};
		case "invite":
			return {
				title: "시루봇 초대하기",
				description: "시루봇을 내 Discord 서버에 초대해요. 음악 신청과 대기열 관리, 웹 플레이어까지 한 번에 쓸 수 있어요.",
				url: `${base}/invite`,
				imageUrl,
				imageAlt: "시루봇",
				buttons: [invite, dashboard]
			};
		case "track":
			return {
				title: "음악 차트",
				description: "Discord에서 인기 있는 음악 차트를 확인하고 바로 재생해요.",
				url: `${base}/track`,
				imageUrl,
				imageAlt: "시루봇",
				buttons: [{ label: "차트 보기", url: `${base}/track` }, invite, dashboard]
			};
		default:
			return null;
	}
}
