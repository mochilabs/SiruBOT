import { emoji, createContainer } from '@sirubot/utils';
import {
	ChannelType,
	ChatInputCommandInteraction,
	GuildPremiumTier,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	MessageFlags,
	SectionBuilder,
	SlashCommandSubcommandBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';

export const name = 'server';
export const ko = '서버';
export const description = '현재 서버의 정보를 보여줘요.';
export const preconditions: string[] = [];

const PREMIUM_TIER_LABELS: Record<GuildPremiumTier, string> = {
	[GuildPremiumTier.None]: '없음',
	[GuildPremiumTier.Tier1]: '레벨 1',
	[GuildPremiumTier.Tier2]: '레벨 2',
	[GuildPremiumTier.Tier3]: '레벨 3'
};

const TIER_NEXT_THRESHOLD: Record<GuildPremiumTier, number | null> = {
	[GuildPremiumTier.None]: 7,
	[GuildPremiumTier.Tier1]: 14,
	[GuildPremiumTier.Tier2]: 30,
	[GuildPremiumTier.Tier3]: null
};

const VERIFICATION_LABELS = ['없음', '낮음', '보통', '높음', '최고'];
const CONTENT_FILTER_LABELS = ['없음', '멤버 이미지', '멤버·역할 이미지 포함'];

const TEXT_CHANNEL_TYPES = new Set<ChannelType>([
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
	ChannelType.GuildForum,
	ChannelType.GuildMedia
]);

const VOICE_CHANNEL_TYPES = new Set<ChannelType>([ChannelType.GuildVoice, ChannelType.GuildStageVoice]);

function boostBar(count: number, next: number): string {
	const filled = Math.max(1, Math.min(10, Math.floor((count / next) * 10)));
	return '▓'.repeat(filled) + '░'.repeat(10 - filled);
}

export function build(sub: SlashCommandSubcommandBuilder): SlashCommandSubcommandBuilder {
	return sub.setName(name).setNameLocalizations({ ko }).setDescription(description).setDescriptionLocalizations({ ko: description });
}

export async function run(interaction: ChatInputCommandInteraction<'cached'>): Promise<void> {
	await interaction.deferReply();

	const guild = interaction.guild;
	const owner = await guild.fetchOwner();
	const createdAt = Math.floor(guild.createdTimestamp / 1000);

	const channels = guild.channels.cache;
	const textCount = channels.filter((c) => TEXT_CHANNEL_TYPES.has(c.type)).size;
	const voiceCount = channels.filter((c) => VOICE_CHANNEL_TYPES.has(c.type)).size;
	const categoryCount = channels.filter((c) => c.type === ChannelType.GuildCategory).size;
	const threadCount = channels.filter((c) => c.isThread()).size;

	const boosts = guild.premiumSubscriptionCount ?? 0;
	const nextThreshold = TIER_NEXT_THRESHOLD[guild.premiumTier];
	const boostLine =
		nextThreshold === null
			? `${emoji('sparkle')} **부스트**: ${PREMIUM_TIER_LABELS[guild.premiumTier]} · ${boosts}개 (최고 티어)`
			: `${emoji('sparkle')} **부스트**: ${PREMIUM_TIER_LABELS[guild.premiumTier]} · ${boosts}개 — 다음 티어까지 ${Math.max(
					0,
					nextThreshold - boosts
				)}개\n\`${boostBar(boosts, nextThreshold)}\``;

	const lines = [
		`### ${emoji('house')} ${guild.name}`,
		``,
		`${emoji('crown')} **소유자**: ${owner.user.tag} (<@${guild.ownerId}>)`,
		`${emoji('calendar')} **생성일**: <t:${createdAt}:F> (<t:${createdAt}:R>)`,
		`${emoji('globe')} **기본 언어**: \`${guild.preferredLocale}\``,
		`${emoji('id')} **서버 ID**: \`${guild.id}\``,
		``,
		`**${emoji('people')} 구성**`,
		`${emoji('people')} **멤버**: ${guild.memberCount.toLocaleString()}명`,
		`${emoji('speech')} **채널**: 전체 ${channels.size}개 — 텍스트 ${textCount} · 음성 ${voiceCount} · 카테고리 ${categoryCount} · 스레드 ${threadCount}`,
		`${emoji('mask')} **역할**: ${guild.roles.cache.size}개 · 최고 역할 <@&${guild.roles.highest.id}>`,
		`${emoji('smile')} **이모지**: ${guild.emojis.cache.size}개 · **스티커**: ${guild.stickers.cache.size}개`,
		``,
		`**${emoji('sparkle')} 부스트 현황**`,
		boostLine,
		``,
		`**${emoji('lock')} 보호 설정**`,
		`${emoji('shield')} **인증 수준**: ${VERIFICATION_LABELS[guild.verificationLevel] ?? guild.verificationLevel}`,
		`${emoji('key')} **2FA 관리자**: ${guild.mfaLevel === 1 ? '필수' : '필수 아님'}`,
		`${emoji('frame')} **콘텐츠 필터**: ${CONTENT_FILTER_LABELS[guild.explicitContentFilter] ?? guild.explicitContentFilter}`,
		`${emoji('sleep')} **AFK 채널**: ${guild.afkChannelId ? `<#${guild.afkChannelId}> · ${guild.afkTimeout / 60}분 후 이동` : '없음'}`
	];

	const containerComponent = createContainer();

	if (guild.iconURL()) {
		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(guild.iconURL({ size: 256 })!));
		containerComponent.addSectionComponents(section);
	} else {
		containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	}

	const bannerUrl = guild.bannerURL({ size: 1024 });
	if (bannerUrl) {
		containerComponent.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrl)));
	}

	await interaction.editReply({
		components: [containerComponent],
		flags: [MessageFlags.IsComponentsV2]
	});
}
