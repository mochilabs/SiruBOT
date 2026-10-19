/**
 * 임베드 복구 리스너 — X·인스타그램·BOOTH 링크의 임베드를 제대로 떠요.
 *
 * - X·인스타그램: 프로바이더 도메인(fxtwitter/fixupx/kkinstagram)으로 바꾼 주소를 다시 보내요 — Discord가 임베드를 떠 줘요.
 * - BOOTH: OG 메타를 직접 읽어 원본 해상도 상품 카드를 만들어요 (도메인 스왑 프로바이더가 없어요).
 * - `<링크>`로 감싼 링크는 미리보기 끄기 의도라 건드리지 않아요 (계약: packages/utils/src/chatTools.ts).
 * - embedFixSuppressOriginal을 켜면 원본 메시지의 임베드를 숨겨요 (메시지 관리 권한이 있을 때만).
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import {
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	Message,
	MessageFlags,
	PermissionFlagsBits,
	SectionBuilder,
	TextDisplayBuilder
} from 'discord.js';
import { MemoryCache, createContainer, createThumbnail, emoji, findEmbedFixLinks, parseBoothOg } from '@sirubot/utils';

const EMBED_FIX_COOLDOWN_MS = 3_000;
const BOOTH_FETCH_TIMEOUT_MS = 10_000;
/** BOOTH OG 서버는 Discord 봇 UA에만 메타를 내려줘요 */
const BOOTH_USER_AGENT = 'Discordbot/2.0';

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class EmbedFixListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: EMBED_FIX_COOLDOWN_MS, maxSize: 5_000 });

	public override async run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			const settings = await this.container.guildService.getChatToolSettings(message.guildId);
			if (!settings.embedFixEnabled) return;

			const links = findEmbedFixLinks(message.content, settings.embedFixSites);
			if (links.length === 0) return;

			const cooldownKey = `${message.guildId}:${message.author.id}`;
			if (this.cooldowns.has(cooldownKey)) return;
			this.cooldowns.set(cooldownKey, true);

			// 도메인 스왑(X·인스타) — 고친 주소만 보내면 Discord가 임베드를 떠 줘요
			const swapLinks = links.filter((link) => link.site !== 'booth');
			if (swapLinks.length > 0) {
				await message
					.reply({
						content: swapLinks.map((link) => link.fixed).join('\n'),
						flags: [MessageFlags.SuppressNotifications],
						allowedMentions: { parse: [] }
					})
					.catch(() => undefined);
			}

			// BOOTH — 자체 OG 임베드 (원본 해상도 이미지)
			const boothLink = links.find((link) => link.site === 'booth');
			if (boothLink) {
				await this.sendBoothEmbed(message, boothLink.original);
			}

			if (settings.embedFixSuppressOriginal) {
				await this.suppressOriginalEmbeds(message);
			}
		} catch (error) {
			this.container.logger.error(`[embedFix] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}

	private async sendBoothEmbed(message: Message<true>, url: string): Promise<void> {
		const meta = await this.fetchBoothOg(url);
		if (!meta) return; // OG 읽기 실패(삭제 상품·일시 장애) — 원본 임베드에 맡겨요

		const container = createContainer();
		container.addSectionComponents(
			new SectionBuilder()
				.addTextDisplayComponents(
					new TextDisplayBuilder().setContent(`## ${meta.title}`),
					new TextDisplayBuilder().setContent(`-# ${emoji('link')} [상품 보기](${meta.url})`)
				)
				.setThumbnailAccessory(createThumbnail(meta.image))
		);
		if (meta.description.length > 0) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(meta.description));
		}
		const gallery = new MediaGalleryBuilder();
		gallery.addItems(new MediaGalleryItemBuilder().setURL(meta.image));
		container.addMediaGalleryComponents(gallery);

		await message
			.reply({
				components: [container],
				flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
				allowedMentions: { parse: [] }
			})
			.catch(() => undefined);
	}

	private async fetchBoothOg(url: string) {
		try {
			const response = await fetch(url, {
				headers: { 'user-agent': BOOTH_USER_AGENT },
				signal: AbortSignal.timeout(BOOTH_FETCH_TIMEOUT_MS)
			});
			if (!response.ok) return null;
			return parseBoothOg(await response.text(), url);
		} catch {
			return null;
		}
	}

	/** 원본 메시지의 임베드 숨김 — 봇에게 메시지 관리 권한이 있을 때만 시도해요 */
	private async suppressOriginalEmbeds(message: Message<true>): Promise<void> {
		const me = message.guild.members.me;
		if (!me) return;
		if (!message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) return;
		await message.suppressEmbeds(true).catch(() => undefined);
	}
}
