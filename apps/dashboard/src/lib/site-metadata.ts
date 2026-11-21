import type { Metadata } from "next";
import { BOT_TAGLINE } from "@sirubot/utils/brand";

export const SITE_NAME = "시루봇";

/** 사이트 기본 제목과 설명. 정체성 문구는 봇과 같은 BOT_TAGLINE을 써요. */
export const SITE_TITLE = "시루봇 | 한국어 커뮤니티 올인원 Discord 봇";
export const SITE_DESCRIPTION = `${BOT_TAGLINE}, 시루봇이에요.`;

/**
 * 페이지별 Open Graph 이미지(1200×630) — public/images에 있어요. 컴포넌트 임베드(lib/discord-embed)도 같이 써요.
 * Pretendard로 미리 렌더한 정적 PNG예요(next/og는 woff2·가변 폰트를 못 읽어서 런타임 생성 대신 이렇게 둬요).
 */
export const OG_IMAGES = {
	home: { url: "/images/og-image.png", alt: "시루봇 — 음악, AI 대화, 서버 관리를 한 봇으로. 한국어 커뮤니티를 위한 올인원 봇" },
	invite: { url: "/images/og-invite.png", alt: "시루봇 — 내 서버에 시루봇을 초대해요" },
	track: { url: "/images/og-track.png", alt: "시루봇 — 지금 뜨는 음악, 바로 재생해요" }
} as const;

interface SocialMetadataInput {
	title: string;
	description: string;
	/** 앱 기준 경로 — metadataBase로 절대 URL이 돼요 */
	path: string;
	image: (typeof OG_IMAGES)[keyof typeof OG_IMAGES];
}

/**
 * openGraph·twitter 메타데이터를 만들어요. Next는 하위 세그먼트의 openGraph 객체로 상위 값을 통째로 덮어쓰므로
 * siteName·locale 같은 공통 필드를 매번 같이 채워요.
 */
export function socialMetadata({ title, description, path, image }: SocialMetadataInput): Pick<Metadata, "openGraph" | "twitter"> {
	const images = [{ url: image.url, width: 1200, height: 630, alt: image.alt }];
	return {
		openGraph: { title, description, url: path, siteName: SITE_NAME, locale: "ko_KR", type: "website", images },
		twitter: { card: "summary_large_image", title, description, images }
	};
}
