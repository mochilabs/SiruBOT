import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	ContainerBuilder,
	RoleSelectMenuBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	TextDisplayBuilder
} from 'discord.js';
import { Guild } from '@sirubot/prisma';
import { createContainer } from '@sirubot/utils';

export type SettingsMode = 'main' | 'dj' | 'music' | 'channel' | 'sponsorblock';

const prefix = 'settings:';
const wrapPrefix = (id: string) => prefix + id;

// SponsorBlock 세그먼트 정의
type SegmentType = {
	name: string;
	label: string;
	emoji: string;
	description: string;
};

export const SPONSORBLOCK_SEGMENTS: SegmentType[] = [
	{ name: 'sponsor', label: '스폰서', emoji: '💰', description: '유료 홍보 및 광고 구간' },
	{ name: 'selfpromo', label: '자기 홍보', emoji: '📢', description: '채널 홍보, 구독 요청 등' },
	{ name: 'interaction', label: '상호작용', emoji: '💬', description: '좋아요, 댓글 요청 등' },
	{ name: 'intro', label: '인트로', emoji: '🎬', description: '반복되는 인트로 영상' },
	{ name: 'outro', label: '아웃트로', emoji: '🔚', description: '엔딩 카드, 크레딧 등' },
	{ name: 'preview', label: '미리보기', emoji: '👀', description: '이전 영상 요약 또는 미리보기' },
	{ name: 'music_offtopic', label: '음악 외 구간', emoji: '🎵', description: '음악 영상에서 음악이 아닌 부분' },
	{ name: 'filler', label: '필러', emoji: '⏭️', description: '주제와 관련 없는 장면' }
];

const repeatLabels: Record<string, string> = {
	off: '반복 없음',
	track: '한 곡 반복',
	queue: '전체 반복'
};

export function settingsView(guild: Guild, mode: SettingsMode = 'main'): ContainerBuilder {
	const container = createContainer();

	switch (mode) {
		case 'main':
			return buildMainView(container, guild);
		case 'music':
			return buildMusicView(container, guild);
		case 'sponsorblock':
			return buildSponsorBlockView(container, guild);
		case 'dj':
			return buildDJView(container, guild);
		case 'channel':
			return buildChannelView(container, guild);
		default:
			return buildMainView(container, guild);
	}
}

// ── 메인 대시보드 ──────────────────────────────────────
function buildMainView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const sponsorBlockStatus = guild.sponsorBlockSegments.length > 0 ? `켜짐 (${guild.sponsorBlockSegments.length}개 구간)` : '꺼짐';

	const lines = [
		`### ⚙️ 서버 설정`,
		``,
		`🔊 **볼륨**: ${guild.volume}%`,
		`🔁 **반복 모드**: ${repeatLabels[guild.repeat] ?? '반복 없음'}`,
		`✨ **추천곡 자동재생**: ${guild.related ? '켜짐' : '꺼짐'}`,
		`🎛️ **컨트롤러**: ${guild.enableController ? '켜짐' : '꺼짐'}`,
		`⏩ **SponsorBlock**: ${sponsorBlockStatus}`,
		`💿 **DJ 역할**: ${guild.djRoleId ? `<@&${guild.djRoleId}>` : '없음 (모든 사용자)'}`,
		`📄 **텍스트 채널**: ${guild.textChannelId ? `<#${guild.textChannelId}>` : '설정 안 됨'}`,
		`🎵 **음성 채널**: ${guild.voiceChannelId ? `<#${guild.voiceChannelId}>` : '설정 안 됨'}`
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('music')).setLabel('🎵 음악 설정').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(wrapPrefix('sponsorblock')).setLabel('⏩ 스폰서블록').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(wrapPrefix('dj')).setLabel('💿 DJ 설정').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(wrapPrefix('channel')).setLabel('📄 채널 설정').setStyle(ButtonStyle.Secondary)
		)
	);

	return container;
}

// ── 음악 설정 ──────────────────────────────────────────
function buildMusicView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### 🎵 음악 설정`,
		``,
		`🎛️ **컨트롤러**: ${guild.enableController ? '켜짐' : '꺼짐'}`,
		`✨ **추천곡 자동재생**: ${guild.related ? '켜짐' : '꺼짐'}`,
		`🔁 **반복 모드**: ${repeatLabels[guild.repeat] ?? '반복 없음'}`
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	const repeatNextLabel = guild.repeat === 'off' ? '한 곡 반복 켜기' : guild.repeat === 'track' ? '전체 반복 켜기' : '반복 끄기';

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(wrapPrefix('toggle:controller'))
				.setLabel(guild.enableController ? '🎛️ 컨트롤러 끄기' : '🎛️ 컨트롤러 켜기')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('toggle:related'))
				.setLabel(guild.related ? '✨ 추천곡 끄기' : '✨ 추천곡 켜기')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(wrapPrefix('toggle:repeat')).setLabel(`🔁 ${repeatNextLabel}`).setStyle(ButtonStyle.Secondary)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('back')).setLabel('◀ 뒤로가기').setStyle(ButtonStyle.Primary)
		)
	);

	return container;
}

// ── 스폰서블록 설정 ─────────────────────────────────────
function buildSponsorBlockView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const activeSegments = guild.sponsorBlockSegments;

	const statusLines = [`### ⏩ SponsorBlock 설정`];
	if (activeSegments.length > 0) {
		const activeLabels = activeSegments
			.map((name) => {
				const segment = SPONSORBLOCK_SEGMENTS.find((s) => s.name === name);
				return segment ? `${segment.emoji} ${segment.label}` : name;
			})
			.join(', ');
		statusLines.push(`현재 건너뛰는 구간: **${activeLabels}**`);
	} else {
		statusLines.push(`건너뛰는 구간이 없어요. (SponsorBlock 비활성)`);
	}

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(statusLines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(wrapPrefix('select:sponsorblock'))
		.setPlaceholder('건너뛸 구간 유형을 선택하세요')
		.setMinValues(0)
		.setMaxValues(SPONSORBLOCK_SEGMENTS.length)
		.addOptions(
			SPONSORBLOCK_SEGMENTS.map((segment) => ({
				label: segment.label,
				value: segment.name,
				emoji: segment.emoji,
				description: segment.description,
				default: activeSegments.includes(segment.name)
			}))
		);

	container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('back')).setLabel('◀ 뒤로가기').setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('reset:sponsorblock'))
				.setLabel('🔄 전체 해제')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(activeSegments.length === 0)
		)
	);

	return container;
}

// ── DJ 설정 ─────────────────────────────────────────────
function buildDJView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### 💿 DJ 설정`,
		`DJ 역할을 설정하면, 해당 역할이나 관리자만 노래 건너뛰기, 반복 모드 변경 등을 할 수 있어요.`,
		``,
		`현재 DJ 역할: ${guild.djRoleId ? `<@&${guild.djRoleId}>` : '**없음** (모든 사용자 허용)'}`
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addActionRowComponents(
		new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
			new RoleSelectMenuBuilder().setCustomId(wrapPrefix('select:dj')).setPlaceholder('DJ 역할을 선택하세요')
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('back')).setLabel('◀ 뒤로가기').setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('remove:dj'))
				.setLabel('🗑 DJ 역할 제거')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.djRoleId)
		)
	);

	return container;
}

// ── 채널 설정 ───────────────────────────────────────────
function buildChannelView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### 📄 채널 설정`,
		`기본 채널을 설정하면, 해당 채널에서만 명령어를 사용하거나 음악을 들을 수 있어요.`,
		``,
		`📄 **텍스트 채널**: ${guild.textChannelId ? `<#${guild.textChannelId}>` : '설정 안 됨'}`,
		`🎵 **음성 채널**: ${guild.voiceChannelId ? `<#${guild.voiceChannelId}>` : '설정 안 됨'}`
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addActionRowComponents(
		new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId(wrapPrefix('select:text'))
				.setPlaceholder('기본 텍스트 채널을 선택하세요')
				.setChannelTypes(ChannelType.GuildText)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId(wrapPrefix('select:voice'))
				.setPlaceholder('기본 음성 채널을 선택하세요')
				.setChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('back')).setLabel('◀ 뒤로가기').setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('remove:text'))
				.setLabel('🗑 텍스트 채널 제거')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.textChannelId),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('remove:voice'))
				.setLabel('🗑 음성 채널 제거')
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.voiceChannelId)
		)
	);

	return container;
}
