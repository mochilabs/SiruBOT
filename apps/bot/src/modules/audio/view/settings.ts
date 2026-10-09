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
import { emoji, createContainer } from '@sirubot/utils';

export type SettingsMode = 'main' | 'dj' | 'music' | 'channel' | 'sponsorblock' | 'jtc';

const prefix = 'settings:';
const wrapPrefix = (id: string) => prefix + id;

// SponsorBlock 세그먼트 정의
type SegmentType = {
	name: string;
	label: string;
	unicode: string;
	appEmojiName: string;
	description: string;
};

// 앱 이모지 매핑은 봇 부팅(clientReady) 이후 로드되므로, 이모지 필드는 사용 시점에 emoji()로 평가한다.
export const SPONSORBLOCK_SEGMENTS: SegmentType[] = [
	{ name: 'sponsor', label: '스폰서', unicode: '💰', appEmojiName: 'money', description: '유료 홍보 및 광고 구간' },
	{ name: 'selfpromo', label: '자기 홍보', unicode: '📢', appEmojiName: 'megaphone', description: '채널 홍보, 구독 요청 등' },
	{ name: 'interaction', label: '상호작용', unicode: '💬', appEmojiName: 'speech', description: '좋아요, 댓글 요청 등' },
	{ name: 'intro', label: '인트로', unicode: '🎬', appEmojiName: 'film', description: '반복되는 인트로 영상' },
	{ name: 'outro', label: '아웃트로', unicode: '🔚', appEmojiName: 'end_flag', description: '엔딩 카드, 크레딧 등' },
	{ name: 'preview', label: '미리보기', unicode: '👀', appEmojiName: 'eye', description: '이전 영상 요약 또는 미리보기' },
	{ name: 'music_offtopic', label: '음악 외 구간', unicode: '🎵', appEmojiName: 'music_note', description: '음악 영상에서 음악이 아닌 부분' },
	{ name: 'filler', label: '필러', unicode: '⏭️', appEmojiName: 'arrow_forward', description: '주제와 관련 없는 장면' }
];

const sponsorBlockSegmentEmoji = (segment: SegmentType) => emoji(segment.appEmojiName, segment.unicode);

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
		case 'jtc':
			return buildJtcView(container, guild);
		default:
			return buildMainView(container, guild);
	}
}

// ── 메인 대시보드 ──────────────────────────────────────
function buildMainView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const sponsorBlockStatus = guild.sponsorBlockSegments.length > 0 ? `켜짐 (${guild.sponsorBlockSegments.length}개 구간)` : '꺼짐';
	const sponsorBlockDescription = guild.sponsorBlockSegments.length > 0 ? `현재 ${guild.sponsorBlockSegments.length}개 구간` : '꺼짐';
	const channelDescription = guild.textChannelId
		? guild.voiceChannelId
			? '텍스트·음성 채널 설정됨'
			: '텍스트 채널 설정됨'
		: guild.voiceChannelId
			? '음성 채널 설정됨'
			: '채널 미설정';

	const lines = [
		`### ${emoji('tools')} 서버 설정`,
		``,
		`${emoji('volume_up')} **볼륨**: ${guild.volume}%`,
		`${emoji('repeat')} **반복 모드**: ${repeatLabels[guild.repeat] ?? '반복 없음'}`,
		`${emoji('sparkle')} **추천곡 자동재생**: ${guild.related ? '켜짐' : '꺼짐'}`,
		`${emoji('spectrum')} **컨트롤러**: ${guild.enableController ? '켜짐' : '꺼짐'}`,
		`${emoji('arrow_forward')} **SponsorBlock**: ${sponsorBlockStatus}`,
		`${emoji('cd')} **DJ 역할**: ${guild.djRoleId ? `<@&${guild.djRoleId}>` : '없음 (모든 사용자)'}`,
		`${emoji('scroll')} **텍스트 채널**: ${guild.textChannelId ? `<#${guild.textChannelId}>` : '설정 안 됨'}`,
		`${emoji('music_note')} **음성 채널**: ${guild.voiceChannelId ? `<#${guild.voiceChannelId}>` : '설정 안 됨'}`,
		`${emoji('pin')} **고정 채널**: ${guild.pinnedChannelId ? `<#${guild.pinnedChannelId}>` : '설정 안 됨'}`,
		`${emoji('volume_up')} **임시 음성채널**: ${guild.jtcEnabled ? '켜짐' : '꺼짐'}`
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addActionRowComponents(
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(wrapPrefix('navigate'))
				.setPlaceholder('설정할 기능을 선택하세요')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions([
					{ value: 'music', label: `${emoji('music_note')} 음악 설정`, description: '컨트롤러·추천곡·반복 모드' },
					{ value: 'sponsorblock', label: `${emoji('arrow_forward')} 스폰서블록`, description: sponsorBlockDescription },
					{ value: 'dj', label: `${emoji('cd')} DJ 설정`, description: guild.djRoleId ? `<@&${guild.djRoleId}>` : '미설정' },
					{ value: 'channel', label: `${emoji('scroll')} 채널 설정`, description: channelDescription },
					{ value: 'jtc', label: `${emoji('volume_up')} 임시 음성`, description: guild.jtcEnabled ? '켜짐' : '꺼짐' }
				])
		)
	);

	return container;
}

// ── 음악 설정 ──────────────────────────────────────────
function buildMusicView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### ${emoji('music_note')} 음악 설정`,
		``,
		`${emoji('spectrum')} **컨트롤러**: ${guild.enableController ? '켜짐' : '꺼짐'}`,
		`${emoji('sparkle')} **추천곡 자동재생**: ${guild.related ? '켜짐' : '꺼짐'}`,
		`${emoji('repeat')} **반복 모드**: ${repeatLabels[guild.repeat] ?? '반복 없음'}`
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	const repeatNextLabel = guild.repeat === 'off' ? '한 곡 반복 켜기' : guild.repeat === 'track' ? '전체 반복 켜기' : '반복 끄기';

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(wrapPrefix('toggle:controller'))
				.setLabel(guild.enableController ? `${emoji('spectrum')} 컨트롤러 끄기` : `${emoji('spectrum')} 컨트롤러 켜기`)
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('toggle:related'))
				.setLabel(guild.related ? `${emoji('sparkle')} 추천곡 끄기` : `${emoji('sparkle')} 추천곡 켜기`)
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('toggle:repeat'))
				.setLabel(`${emoji('repeat')} ${repeatNextLabel}`)
				.setStyle(ButtonStyle.Secondary)
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

	const statusLines = [`### ${emoji('arrow_forward')} SponsorBlock 설정`];
	if (activeSegments.length > 0) {
		const activeLabels = activeSegments
			.map((name) => {
				const segment = SPONSORBLOCK_SEGMENTS.find((s) => s.name === name);
				return segment ? `${sponsorBlockSegmentEmoji(segment)} ${segment.label}` : name;
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
				emoji: sponsorBlockSegmentEmoji(segment),
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
				.setLabel(`${emoji('repeat')} 전체 해제`)
				.setStyle(ButtonStyle.Danger)
				.setDisabled(activeSegments.length === 0)
		)
	);

	return container;
}

// ── DJ 설정 ─────────────────────────────────────────────
function buildDJView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### ${emoji('cd')} DJ 설정`,
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
				.setLabel(`${emoji('trash')} DJ 역할 제거`)
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.djRoleId)
		)
	);

	return container;
}

// ── 채널 설정 ───────────────────────────────────────────
function buildChannelView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### ${emoji('scroll')} 채널 설정`,
		`기본 채널을 설정하면, 해당 채널에서만 명령어를 사용하거나 음악을 들을 수 있어요.`,
		``,
		`${emoji('scroll')} **텍스트 채널**: ${guild.textChannelId ? `<#${guild.textChannelId}>` : '설정 안 됨'}`,
		`${emoji('music_note')} **음성 채널**: ${guild.voiceChannelId ? `<#${guild.voiceChannelId}>` : '설정 안 됨'}`,
		`${emoji('pin')} **고정 채널**: ${guild.pinnedChannelId ? `<#${guild.pinnedChannelId}>` : '설정 안 됨'}`,
		`${emoji('inbox_tray')} **고정 채널 입력 동작**: ${guild.pinnedChannelMode === 'select' ? '선택 재생 (5개 중 선택)' : '즉시 재생 (첫 결과)'}`
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

	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			`${emoji('pin')} **고정 채널**: 이 채널에 메시지를 입력하면 검색어로 재생해요. 권한 제한 없이 사용할 수 있으며, 재생 시 컨트롤러 메시지는 고정 유지돼요.`
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId(wrapPrefix('select:pin'))
				.setPlaceholder('고정 채널을 선택하세요')
				.setChannelTypes(ChannelType.GuildText)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(wrapPrefix('select:pinmode'))
				.setPlaceholder('입력 동작 선택')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions([
					{
						label: `${emoji('arrow_forward')} 즉시 재생 (첫 결과 바로 재생)`,
						value: 'play',
						default: guild.pinnedChannelMode !== 'select'
					},
					{
						label: `${emoji('clipboard')} 선택 재생 (5개 중 선택)`,
						value: 'select',
						default: guild.pinnedChannelMode === 'select'
					}
				])
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('back')).setLabel('◀ 뒤로가기').setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('remove:text'))
				.setLabel(`${emoji('trash')} 텍스트 채널 제거`)
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.textChannelId),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('remove:voice'))
				.setLabel(`${emoji('trash')} 음성 채널 제거`)
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.voiceChannelId),
			new ButtonBuilder()
				.setCustomId(wrapPrefix('remove:pin'))
				.setLabel(`${emoji('trash')} 고정 채널 제거`)
				.setStyle(ButtonStyle.Danger)
				.setDisabled(!guild.pinnedChannelId)
		)
	);

	return container;
}

// ── 임시 음성채널 설정 ──────────────────────────────────
function buildJtcView(container: ContainerBuilder, guild: Guild): ContainerBuilder {
	const lines = [
		`### ${emoji('volume_up')} 임시 음성채널 설정`,
		``,
		`**상태**: ${guild.jtcEnabled ? '켜짐' : '꺼짐'}`,
		`**생성 위치**: ${guild.jtcCategoryId ? `<#${guild.jtcCategoryId}>` : '`미설정`'}`,
		`**방 이름 템플릿**: \`${guild.jtcTemplate}\``,
		`**인원 제한**: \`${guild.jtcUserLimit === 0 ? '무제한' : `${guild.jtcUserLimit}명`}\``
	];

	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			'-# 마커 채널에 들어오면 방이 만들어져요. 방장만 방 이름·인원을 바꿀 수 있고, 30초간 아무도 없으면 사라져요.'
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(wrapPrefix('toggle:jtc'))
				.setLabel(guild.jtcEnabled ? '설정 끄기' : '설정 켜기')
				.setStyle(guild.jtcEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
				.setDisabled(!guild.jtcMarkerChannelId && !guild.jtcEnabled)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
			new ChannelSelectMenuBuilder()
				.setCustomId(wrapPrefix('select:jtccategory'))
				.setChannelTypes(ChannelType.GuildCategory)
				.setPlaceholder('방을 만들 카테고리를 선택하세요')
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(wrapPrefix('jtctemplate'))
				.setLabel(`${emoji('bell')} 방 이름 수정`)
				.setStyle(ButtonStyle.Secondary)
		)
	);

	const limitOptions = [0, 1, 2, 3, 5, 10].map((value) => ({
		label: value === 0 ? '무제한' : `${value}명`,
		value: String(value),
		default: guild.jtcUserLimit === value
	}));

	container.addActionRowComponents(
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(wrapPrefix('select:jtclimit'))
				.setPlaceholder('입장 인원 제한')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(limitOptions)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId(wrapPrefix('back')).setLabel('◀ 뒤로가기').setStyle(ButtonStyle.Primary)
		)
	);

	return container;
}
