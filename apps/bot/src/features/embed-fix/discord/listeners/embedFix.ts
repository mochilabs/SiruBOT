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
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';

const EMBED_FIX_COOLDOWN_MS = 3_000;
const BOOTH_FETCH_TIMEOUT_MS = 10_000;
/** BOOTH OG 서버는 Discord 봇 UA에만 메타를 내려줘요 */
const BOOTH_USER_AGENT = 'Discordbot/2.0';
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
			if (!(await isMessageFeatureEnabled(this.container.guildService, message.guildId, 'embed-fix'))) return;
			const settings = await guildChatPolicy.getChatToolSettings(this.container.guildService, message.guildId);
			if (!isChannelToggleEnabled(settings.embedFix, message.channelId)) return;

			const links = findEmbedFixLinks(message.content, settings.embedFixSites);
			if (links.length === 0) return;

			const cooldownKey = `${message.guildId}:${message.author.id}`;
			if (this.cooldowns.has(cooldownKey)) return;
			this.cooldowns.set(cooldownKey, true);

			this.container.usageRecorder?.record(message.guildId, usageFeatureKey('msg', 'embed-fix'), message.author.id);
			const payloads = await this.buildPayloads(links, settings.embedFixTranslateLang);
			if (payloads.length > 0) await this.sendPayloads(message, payloads);

			if (settings.embedFixSuppressOriginal) {
				await this.suppressOriginalEmbeds(message);
			}
		} catch (error) {
			this.container.logger.error(`[embedFix] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}

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

	private async suppressOriginalEmbeds(message: Message<true>): Promise<void> {
		const me = message.guild.members.me;
		if (!me) return;
		if (!message.channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) return;
		await message.suppressEmbeds(true).catch(() => undefined);
	}
}
