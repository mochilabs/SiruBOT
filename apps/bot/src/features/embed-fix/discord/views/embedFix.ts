import { createContainer, createThumbnail, emoji, type EmbedFixResult, type EmbedFixSite } from '@sirubot/utils';
import {
	ButtonBuilder,
	ButtonStyle,
	type ContainerBuilder,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	TextDisplayBuilder
} from 'discord.js';

/** CV2 텍스트 표시 상한 — 트윗 본문보다 넉넉하게 */
const CARD_TEXT_MAX = 1_000;
/** 미디어 갤러리 항목 상한 (Components V2 제한) */
const CARD_IMAGE_MAX = 10;

/** OG 카드 사이트(Instagram·TikTok·Reddit·Pixiv·Threads) 헤더 문구와 이모지 */
const OG_CARD_SITE_HEADERS = {
	instagram: { label: 'Instagram 게시물', emoji: 'frame' },
	tiktok: { label: 'TikTok 영상', emoji: 'link' },
	reddit: { label: 'Reddit 게시물', emoji: 'link' },
	pixiv: { label: 'Pixiv 작품', emoji: 'frame' },
	threads: { label: 'Threads 게시물', emoji: 'link' }
} as const;
type OgCardSiteKey = keyof typeof OG_CARD_SITE_HEADERS;
type OgCardSiteHeader = (typeof OG_CARD_SITE_HEADERS)[OgCardSiteKey];

/** 플랫폼 브랜드색(HEX) — 카드 accent color. Threads 브랜드는 검정이에요. */
const SITE_ACCENT_COLORS: Record<EmbedFixSite, string> = {
	x: '#1DA1F2',
	instagram: '#E1306C',
	booth: '#FC4F4F',
	tiktok: '#FE2C55',
	reddit: '#FF4500',
	pixiv: '#0096FA',
	threads: '#000000'
};

export function embedFixCard(result: EmbedFixResult): ContainerBuilder | null {
	if (result.site === 'x') return buildXCard(result);
	if (result.site === 'booth') return boothCard(result);
	const header = OG_CARD_SITE_HEADERS[result.site as OgCardSiteKey];
	return header ? buildOgCard(result, header) : null;
}

/** OG 카드 — 제목·본문·미디어 뒤 마지막 섹션에 사이트 라벨과 원문 버튼을 놓아요 */
function buildOgCard(result: EmbedFixResult, header: OgCardSiteHeader): ContainerBuilder | null {
	if (!result.sourceUrl) return null;
	const container = createContainer(SITE_ACCENT_COLORS[result.site]);

	if (result.title) {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${result.title}`));
	}
	if (result.description && result.description.length > 0) {
		const text = result.description.length > CARD_TEXT_MAX ? `${result.description.slice(0, CARD_TEXT_MAX - 1)}…` : result.description;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
	}
	addTranslationBlock(container, result.translatedTitle, result.translatedDescription);
	// og:video(TikTok 등)를 우선으로 깔고 나머지 이미지를 이어요
	const mediaUrls = [...(result.videoUrl ? [result.videoUrl] : []), ...(result.images ?? [])].slice(0, CARD_IMAGE_MAX);
	if (mediaUrls.length > 0) {
		const gallery = new MediaGalleryBuilder();
		for (const url of mediaUrls) gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
		container.addMediaGalleryComponents(gallery);
	}

	container.addSectionComponents(
		new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${emoji(header.emoji)} ${header.label}`))
			.setButtonAccessory(buildSourceButton(result.sourceUrl))
	);
	return container;
}

/** X 카드 — 작성자 섹션(프사 썸네일) + 본문 + 사진 + 참여 수 + 원문 버튼 */
function buildXCard(result: EmbedFixResult): ContainerBuilder | null {
	if (!result.sourceUrl) return null;
	const container = createContainer(SITE_ACCENT_COLORS[result.site]);

	const headerComponents = [
		new TextDisplayBuilder().setContent(`**${result.authorName ?? 'X 게시물'}**`),
		...(result.authorHandle ? [new TextDisplayBuilder().setContent(`-# @${result.authorHandle}`)] : [])
	];
	if (result.authorAvatar) {
		container.addSectionComponents(
			new SectionBuilder().addTextDisplayComponents(...headerComponents).setThumbnailAccessory(createThumbnail(result.authorAvatar))
		);
	} else {
		container.addTextDisplayComponents(...headerComponents);
	}

	if (result.description && result.description.length > 0) {
		const text = result.description.length > CARD_TEXT_MAX ? `${result.description.slice(0, CARD_TEXT_MAX - 1)}…` : result.description;
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(text));
	}
	addTranslationBlock(container, result.translatedTitle, result.translatedDescription);
	addImageGallery(container, result.images);

	const stats = `-# ${emoji('speech')} ${result.replyCount ?? 0} · ${emoji('repeat')} ${result.retweetCount ?? 0} · ${emoji('heart')} ${result.likeCount ?? 0}${
		result.createdAt ? ` · <t:${result.createdAt}:R>` : ''
	}`;
	container.addSectionComponents(
		new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(stats))
			.setButtonAccessory(buildSourceButton(result.sourceUrl))
	);
	return container;
}

/** BOOTH 상품 카드 — 원본 해상도 상품 이미지로 마지막 섹션에 라벨과 원문 버튼을 놓아요 */
export function boothCard(result: EmbedFixResult): ContainerBuilder | null {
	if (!result.sourceUrl || !result.title) return null;
	const image = result.images?.[0];
	const container = createContainer(SITE_ACCENT_COLORS[result.site]);

	const titleComponents = [new TextDisplayBuilder().setContent(`## ${result.title}`)];
	if (image) {
		container.addSectionComponents(
			new SectionBuilder().addTextDisplayComponents(...titleComponents).setThumbnailAccessory(createThumbnail(image))
		);
	} else {
		container.addTextDisplayComponents(...titleComponents);
	}

	if (result.description && result.description.length > 0) {
		container.addTextDisplayComponents(new TextDisplayBuilder().setContent(result.description));
	}
	addTranslationBlock(container, result.translatedTitle, result.translatedDescription);
	addImageGallery(container, result.images);

	container.addSectionComponents(
		new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${emoji('link')} BOOTH 상품`))
			.setButtonAccessory(buildSourceButton(result.sourceUrl))
	);
	return container;
}

function addTranslationBlock(container: ContainerBuilder, translatedTitle: string | undefined, translatedDescription: string | undefined): void {
	const lines: string[] = [];
	if (translatedTitle && translatedTitle.length > 0) {
		lines.push(`**${translatedTitle}**`);
	}
	if (translatedDescription && translatedDescription.length > 0) {
		const text = translatedDescription.length > CARD_TEXT_MAX ? `${translatedDescription.slice(0, CARD_TEXT_MAX - 1)}…` : translatedDescription;
		lines.push(text);
	}
	if (lines.length === 0) return;
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${emoji('globe')} 번역\n${lines.join('\n')}`));
}
function buildSourceButton(url: string): ButtonBuilder {
	return new ButtonBuilder().setLabel('원문 보기').setStyle(ButtonStyle.Link).setURL(url);
}

function addImageGallery(container: ContainerBuilder, images: string[] | undefined): void {
	if (!images || images.length === 0) return;
	const gallery = new MediaGalleryBuilder();
	for (const url of images.slice(0, CARD_IMAGE_MAX)) gallery.addItems(new MediaGalleryItemBuilder().setURL(url));
	container.addMediaGalleryComponents(gallery);
}
