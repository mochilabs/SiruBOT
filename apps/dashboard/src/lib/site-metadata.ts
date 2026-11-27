import type { Metadata } from "next";
import { BOT_TAGLINE } from "@sirubot/utils/brand";

export const SITE_NAME = "시루봇";

export const SITE_TITLE = "시루봇 | 한국어 커뮤니티 올인원 Discord 봇";
export const SITE_DESCRIPTION = `${BOT_TAGLINE}, 시루봇이에요.`;

// Pre-rendered static PNGs (next/og cannot load woff2/variable Pretendard).
export const OG_IMAGES = {
	home: { url: "/images/og-image.png", alt: "시루봇 — 음악, AI 대화, 서버 관리를 한 봇으로. 한국어 커뮤니티를 위한 올인원 봇" },
	invite: { url: "/images/og-invite.png", alt: "시루봇 — 내 서버에 시루봇을 초대해요" },
	track: { url: "/images/og-track.png", alt: "시루봇 — 지금 뜨는 음악, 바로 재생해요" }
} as const;

interface SocialMetadataInput {
	title: string;
	description: string;
	path: string;
	image: (typeof OG_IMAGES)[keyof typeof OG_IMAGES];
}

// Next.js replaces parent openGraph objects per segment, so repeat siteName/locale here.
export function socialMetadata({ title, description, path, image }: SocialMetadataInput): Pick<Metadata, "openGraph" | "twitter"> {
	const images = [{ url: image.url, width: 1200, height: 630, alt: image.alt }];
	return {
		openGraph: { title, description, url: path, siteName: SITE_NAME, locale: "ko_KR", type: "website", images },
		twitter: { card: "summary_large_image", title, description, images }
	};
}
