/**
 * 임베드 복구 리스너 — X·인스타그램·BOOTH·TikTok·Reddit·Pixiv·Threads 링크의 임베드를 제대로 떠요.
 *
 * - 메타데이터는 data-api(/v1/embed-fix/metadata)에 물어봐요 — 캐싱은 data-api 계층에서 해요.
 *   OG 메타가 오는 사이트는 전부 Components V2 카드로 재구성해요 — accent color는 플랫폼 브랜드색이에요.
 *   모든 카드의 "원문 보기" 버튼은 마지막 섹션 accessory로 위치를 통일했어요.
 * - 결과는 채널 웹훅으로 "링크를 보낸 사람" 이름·프사로 보내요 (embed-fixer 관행).
 *   웹훅을 못 쓰면(스레드·권한 없음·실패) 봇 아이디 리플라이로 폴백해요.
 * - data-api를 못 쓰면 레거시 경로로 폴백해요 — 고친 주소(fxtwitter/fixupx/kkinstagram)를 다시 보내
 *   Discord가 임베드를 떠 주게 하고, BOOTH는 OG 메타를 직접 읽어요.
 * - `<링크>`로 감싼 링크는 미리보기 끄기 의도라 건드리지 않아요 (계약: packages/utils/src/chatTools.ts).
 * - embedFixSuppressOriginal을 켜면 원본 메시지의 임베드를 숨겨요 (메시지 관리 권한이 있을 때만).
 */
import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { type ContainerBuilder, Message, MessageFlags, PermissionFlagsBits } from 'discord.js';
import {
	type EmbedFixBoothLink,
	type EmbedFixLink,
	type EmbedFixResult,
	type EmbedFixSwapLink,
	type EmbedFixTranslateLang,
	MemoryCache,
	findEmbedFixLinks,
	parseBoothOg
} from '@sirubot/utils';
import { boothCard, embedFixCard } from '../views/embedFix.ts';
import { fetchEmbedFixMetadata } from '../../application/embedFixGateway.ts';
import { dataApiAuthHeaders, gatewayBaseUrl } from '../../../../lib/dataApi.ts';
import { isChannelToggleEnabled } from '../../../../services/guildService.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';

const EMBED_FIX_COOLDOWN_MS = 3_000;
const BOOTH_FETCH_TIMEOUT_MS = 10_000;
/** BOOTH OG 서버는 Discord 봇 UA에만 메타를 내려줘요 */
const BOOTH_USER_AGENT = 'Discordbot/2.0';
/** 전송 가능한 결과 한 건 — content(레거시 스왑 링크) 또는 components(CV2 카드) */
interface EmbedFixPayload {
	content?: string;
	components?: ContainerBuilder;
}

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class EmbedFixListener extends Listener {
	private readonly cooldowns = new MemoryCache<string, true>({ ttl: EMBED_FIX_COOLDOWN_MS, maxSize: 5_000 });

	public override async run(message: Message) {
		if (message.author.bot || !message.inGuild() || message.webhookId) return;
		if (!message.channel.isSendable()) return;

		try {
			const settings = await guildChatPolicy.getChatToolSettings(this.container.guildService, message.guildId);
			if (!isChannelToggleEnabled(settings.embedFix, message.channelId)) return;

			const links = findEmbedFixLinks(message.content, settings.embedFixSites);
			if (links.length === 0) return;

			const cooldownKey = `${message.guildId}:${message.author.id}`;
			if (this.cooldowns.has(cooldownKey)) return;
			this.cooldowns.set(cooldownKey, true);

			const payloads = await this.buildPayloads(links, settings.embedFixTranslateLang);
			if (payloads.length > 0) await this.sendPayloads(message, payloads);

			if (settings.embedFixSuppressOriginal) {
				await this.suppressOriginalEmbeds(message);
			}
		} catch (error) {
			this.container.logger.error(`[embedFix] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}

	/** 우선 data-api 카드(메타 캐싱은 data-api 계층), data-api를 못 쓰면 레거시 도메인 스왑으로 폴백해요 */
	private async buildPayloads(links: EmbedFixLink[], translateTo: EmbedFixTranslateLang = 'off'): Promise<EmbedFixPayload[]> {
		const gatewayResults = await fetchEmbedFixMetadata(
			{ logger: this.container.logger, baseUrl: gatewayBaseUrl, authHeaders: dataApiAuthHeaders },
			{
				links: links.map((link) =>
					link.site === 'booth' ? { site: link.site, url: link.original } : { site: link.site, url: link.original, fixedUrl: link.fixed }
				),
				...(translateTo !== 'off' ? { translateTo } : {})
			}
		);
		if (gatewayResults) return this.payloadsFromResults(gatewayResults);

		return this.buildLegacyPayloads(links);
	}

	/** 게이트웨이 결과를 전송 페이로드로 바꿔요 — skip은 버리고, link 모드는 주소를 모아 한 메시지로 묶어요 */
	private payloadsFromResults(results: EmbedFixResult[]): EmbedFixPayload[] {
		const payloads: EmbedFixPayload[] = [];
		const fixedUrls: string[] = [];
		for (const result of results) {
			if (result.mode === 'skip') continue;
			if (result.mode === 'link') {
				if (result.fixedUrl) fixedUrls.push(result.fixedUrl);
				continue;
			}
			const container = embedFixCard(result);
			if (container) payloads.push({ components: container });
		}
		if (fixedUrls.length > 0) payloads.push({ content: fixedUrls.join('\n') });
		return payloads;
	}

	/** 레거시 경로 — 고친 주소를 다시 보내 Discord가 임베드를 떠 주게 하고, BOOTH는 OG를 직접 읽어요 */
	private async buildLegacyPayloads(links: EmbedFixLink[]): Promise<EmbedFixPayload[]> {
		const payloads: EmbedFixPayload[] = [];

		const swapLinks = links.filter((link): link is EmbedFixSwapLink => link.site !== 'booth');
		if (swapLinks.length > 0) payloads.push({ content: swapLinks.map((link) => link.fixed).join('\n') });

		const boothLink = links.find((link): link is EmbedFixBoothLink => link.site === 'booth');
		if (boothLink) {
			const meta = await this.fetchBoothOg(boothLink.original);
			if (meta) {
				const container = boothCard({
					site: 'booth',
					mode: 'card',
					title: meta.title,
					description: meta.description,
					images: [meta.image],
					sourceUrl: meta.url
				});
				if (container) payloads.push({ components: container });
			}
		}

		return payloads;
	}

	/** 웹훅 릴레이(원작자 이름·프사) → 실패 시 봇 아이디 리플라이 폴백 */
	private async sendPayloads(message: Message<true>, payloads: EmbedFixPayload[]): Promise<void> {
		const username = message.member?.displayName ?? message.author.displayName;
		const avatarURL = message.author.displayAvatarURL({ size: 256, extension: 'png' });

		for (const payload of payloads) {
			const relayed = await this.container.webhookRelay.relay(message, {
				username,
				avatarURL,
				content: payload.content,
				components: payload.components ? [payload.components] : undefined
			});
			if (relayed) continue;

			await message
				.reply({
					...(payload.content ? { content: payload.content } : {}),
					...(payload.components ? { components: [payload.components] } : {}),
					flags: payload.components
						? [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications]
						: [MessageFlags.SuppressNotifications],
					allowedMentions: { parse: [] }
				})
				.catch(() => undefined);
		}
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
