import { ActionRowBuilder, ContainerBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';
import { Guild } from '@sirubot/prisma';
import { emoji, createContainer, normalizeEmbedFixSites } from '@sirubot/utils';
import { BOT_MODULES, isModuleDisabled } from '@sirubot/utils/modules';
import { TRANSITION_LABELS, transitionMode } from '@sirubot/utils/mixerTransition';
import { settingsId } from '../customIds.ts';
import { jtcEmptyGraceText } from '../../../temp-voice/index.ts';
import { getConfig } from '../../../../lib/config.ts';
import { normalizeAiMode, isChannelToggleEnabled } from '../../../../services/guildSettings/types.ts';
import { normalizeAnnounceMode } from '../../../../services/guildSettings/playback.ts';
import { SETTINGS_ACTIONS } from '../settings/index.ts';
import { buildBackButton, buildMusicSubNav } from '../settings/core.ts';
import { chatToolEnabledIn, CHAT_TOOL_LABELS } from '../settings/chatTools.ts';
import { AI_MODE_LABELS, ANNOUNCE_MODE_LABELS, SPONSORBLOCK_SEGMENTS, repeatLabels, sponsorBlockSegmentEmoji } from '../settings/labels.ts';
import {
	isMusicSubpage,
	type SettingsComponentAction,
	type SettingsControlBuilder,
	type SettingsScreen,
	type SettingsViewContext
} from '../settings/types.ts';

export type SettingsMode = SettingsScreen;
export { SPONSORBLOCK_SEGMENTS };

/** 화면을 이루는 조각 — 텍스트는 화면마다 손으로 쓰고, 컨트롤 줄은 `SETTINGS_ACTIONS`에서 생성해요 */
type Part =
	| { text: (guild: Guild, ctx: SettingsViewContext) => string }
	| { separator: true }
	/** 표에서 `control.screen`이 이 화면이고 `control.row`가 같은 컨트롤을 표의 순서대로 한 줄에 놓아요. back이면 뒤로가기를 맨 앞에 붙여요. */
	| { row: string; back?: boolean }
	/** 뒤로가기만 있는 줄 */
	| { back: true }
	/** 음악 하위 페이지 이동 셀렉트 — 현재 화면이 선택돼 있어요 */
	| { musicNav: true };

const TEXT = (text: (guild: Guild, ctx: SettingsViewContext) => string): Part => ({ text });
const SEPARATOR: Part = { separator: true };
const MUSIC_NAV: Part = { musicNav: true };

const onOff = (value: boolean) => (value ? '켜짐' : '꺼짐');

const SCREEN_PARTS: Record<SettingsScreen, Part[]> = {
	main: [TEXT(mainText), SEPARATOR, { row: 'nav' }, { row: 'modules' }],
	music: [TEXT(musicText), SEPARATOR, MUSIC_NAV, { row: 'toggles' }, { back: true }],
	sponsorblock: [TEXT(sponsorBlockText), SEPARATOR, MUSIC_NAV, { row: 'segments' }, { row: 'actions', back: true }],
	dj: [TEXT(djText), SEPARATOR, MUSIC_NAV, { row: 'pick' }, { row: 'actions', back: true }],
	channel: [
		TEXT(channelText),
		SEPARATOR,
		{ row: 'text' },
		{ row: 'voice' },
		SEPARATOR,
		TEXT(
			() =>
				`${emoji('pin')} 채팅 입력 재생을 켜면 기본 채널에 곡 제목이나 링크를 입력해 바로 재생할 수 있어요. **입력 메시지 삭제**까지 켜면 플레이어 패널이 메시지 1개로 고정돼요.`
		),
		{ row: 'inputMode' },
		{ row: 'actions', back: true }
	],
	jtc: [
		TEXT(jtcText),
		SEPARATOR,
		TEXT(
			() =>
				`-# 마커 채널에 들어오면 방이 만들어져요. 방장만 방 이름·인원을 바꿀 수 있고, ${jtcEmptyGraceText(getConfig().tempVoice.emptyGraceMs)}간 아무도 없으면 사라져요.`
		),
		{ row: 'toggle' },
		{ row: 'category' },
		{ row: 'template' },
		{ row: 'limit' },
		{ back: true }
	],
	// 하위 이동 줄이 늘어 행 5개 한도를 넘으므로 갭리스·정규화·고급 설정 버튼은 한 줄에 놓아요
	audio: [TEXT(audioText), SEPARATOR, MUSIC_NAV, { row: 'transition' }, { row: 'toggles' }, { row: 'announce' }, { back: true }],
	ai: [TEXT(aiText), SEPARATOR, { row: 'mode' }, { row: 'actions', back: true }],
	chatTools: [TEXT(chatToolsText), SEPARATOR, { row: 'tools' }, { row: 'counting' }, { row: 'actions', back: true }]
};

export function settingsView(guild: Guild, mode: SettingsMode = 'main', ctx: SettingsViewContext = {}): ContainerBuilder {
	const container = createContainer();
	const parts = SCREEN_PARTS[mode] ?? SCREEN_PARTS.main;
	const screen: SettingsScreen = SCREEN_PARTS[mode] ? mode : 'main';

	for (const part of parts) {
		if ('text' in part) {
			container.addTextDisplayComponents(new TextDisplayBuilder().setContent(part.text(guild, ctx)));
		} else if ('separator' in part) {
			container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
		} else if ('musicNav' in part) {
			if (isMusicSubpage(screen)) {
				container.addActionRowComponents(
					new ActionRowBuilder<SettingsControlBuilder>().addComponents(buildMusicSubNav(screen).setCustomId(settingsId.encode('navigate')))
				);
			}
		} else if ('row' in part) {
			const controls: SettingsControlBuilder[] = [];
			if (part.back) controls.push(buildBackButton().setCustomId(settingsId.encode('back')));
			for (const [action, entry] of Object.entries(SETTINGS_ACTIONS)) {
				const control = entry.control;
				if (!control || control.screen !== screen || control.row !== part.row) continue;
				controls.push(control.build(guild, ctx).setCustomId(settingsId.encode(action as SettingsComponentAction)));
			}
			if (controls.length > 0) container.addActionRowComponents(new ActionRowBuilder<SettingsControlBuilder>().addComponents(controls));
		} else {
			container.addActionRowComponents(
				new ActionRowBuilder<SettingsControlBuilder>().addComponents(buildBackButton().setCustomId(settingsId.encode('back')))
			);
		}
	}
	return container;
}

function mainText(guild: Guild): string {
	const sponsorBlockStatus = guild.sponsorBlockSegments.length > 0 ? `켜짐 (${guild.sponsorBlockSegments.length}개 구간)` : '꺼짐';
	return [
		`### ${emoji('tools')} 서버 설정`,
		``,
		`${emoji('volume_up')} **볼륨**: ${guild.volume}%`,
		`${emoji('repeat')} **반복 모드**: ${repeatLabels[guild.repeat] ?? '반복 없음'}`,
		`${emoji('sparkle')} **추천 곡 자동재생**: ${onOff(guild.related)}`,
		`${emoji('spectrum')} **컨트롤러**: ${onOff(guild.enableController)}`,
		`${emoji('spectrum')} **곡 전환**: ${TRANSITION_LABELS[transitionMode(guild)]} · 갭리스 ${onOff(guild.gaplessEnabled)}`,
		`${emoji('arrow_forward')} **SponsorBlock**: ${sponsorBlockStatus}`,
		`${emoji('cd')} **DJ 역할**: ${guild.djRoleId ? `<@&${guild.djRoleId}>` : '없음 (모든 사용자)'}`,
		`${emoji('scroll')} **텍스트 채널**: ${guild.textChannelId ? `<#${guild.textChannelId}>` : '설정 안 됨'}`,
		`${emoji('music_note')} **음성 채널**: ${guild.voiceChannelId ? `<#${guild.voiceChannelId}>` : '설정 안 됨'}`,
		`${emoji('volume_up')} **임시 음성 채널**: ${onOff(guild.jtcEnabled)}`,
		`${emoji('robot')} **AI 채팅**: ${AI_MODE_LABELS[normalizeAiMode(guild.aiMode)]}`,
		`${emoji('tools')} **기능 모듈**: ${moduleSummary(guild)}`
	].join('\n');
}

/** 첫 화면 요약 한 줄 — 꺼진 모듈 이름만 보여줘요 */
function moduleSummary(guild: Guild): string {
	const off = BOT_MODULES.filter((m) => isModuleDisabled(guild.disabledModules, m.id)).map((m) => m.label);
	return off.length > 0 ? `${off.join(', ')} 꺼짐` : '모두 켜짐';
}

function musicText(guild: Guild): string {
	return [
		`### ${emoji('music_note')} 음악 · 재생`,
		``,
		`${emoji('spectrum')} **컨트롤러**: ${onOff(guild.enableController)}`,
		`${emoji('sparkle')} **추천 곡 자동재생**: ${onOff(guild.related)}`,
		`${emoji('repeat')} **반복 모드**: ${repeatLabels[guild.repeat] ?? '반복 없음'}`
	].join('\n');
}

function sponsorBlockText(guild: Guild): string {
	const activeSegments = guild.sponsorBlockSegments;
	const lines = [`### ${emoji('arrow_forward')} SponsorBlock 설정`];
	if (activeSegments.length > 0) {
		const activeLabels = activeSegments
			.map((name) => {
				const segment = SPONSORBLOCK_SEGMENTS.find((s) => s.name === name);
				return segment ? `${sponsorBlockSegmentEmoji(segment)} ${segment.label}` : name;
			})
			.join(', ');
		lines.push(`현재 건너뛰는 구간: **${activeLabels}**`);
	} else {
		lines.push(`건너뛰는 구간이 없어요. (SponsorBlock 비활성)`);
	}
	return lines.join('\n');
}

function djText(guild: Guild): string {
	return [
		`### ${emoji('cd')} DJ 설정`,
		`DJ 역할을 설정하면, 해당 역할이나 관리자만 노래 건너뛰기, 반복 모드 변경 등을 할 수 있어요.`,
		``,
		`현재 DJ 역할: ${guild.djRoleId ? `<@&${guild.djRoleId}>` : '**없음** (모든 사용자 허용)'}`
	].join('\n');
}

function channelText(guild: Guild): string {
	return [
		`### ${emoji('scroll')} 채널 설정`,
		`기본 텍스트 채널을 설정하면 해당 채널에서만 명령어를 사용할 수 있어요.`,
		``,
		`${emoji('scroll')} **텍스트 채널**: ${guild.textChannelId ? `<#${guild.textChannelId}>` : '설정 안 됨'}`,
		`${emoji('music_note')} **음성 채널**: ${guild.voiceChannelId ? `<#${guild.voiceChannelId}>` : '설정 안 됨'}`,
		`${emoji('inbox_tray')} **채팅 입력 재생**: ${guild.textChannelInputPlay ? (guild.textChannelMode === 'select' ? '켜짐 · 선택 재생 (5개 중 선택)' : '켜짐 · 즉시 재생 (첫 결과)') : '꺼짐'} · **입력 메시지 삭제**: ${guild.textChannelDeleteInput ? '삭제함' : '보존'}`
	].join('\n');
}

function jtcText(guild: Guild): string {
	return [
		`### ${emoji('volume_up')} 임시 음성 채널 설정`,
		``,
		`**상태**: ${onOff(guild.jtcEnabled)}`,
		`**생성 위치**: ${guild.jtcCategoryId ? `<#${guild.jtcCategoryId}>` : '`미설정`'}`,
		`**방 이름 템플릿**: \`${guild.jtcTemplate}\``,
		`**인원 제한**: \`${guild.jtcUserLimit === 0 ? '무제한' : `${guild.jtcUserLimit}명`}\``
	].join('\n');
}

function audioText(guild: Guild): string {
	const mode = transitionMode(guild);
	return [
		`### ${emoji('spectrum')} 오디오(믹서) 설정`,
		`-# 바꾸면 재생 중인 곡에도 바로 적용돼요. 서버 관리 권한이 필요해요.`,
		``,
		`**곡 전환**: ${TRANSITION_LABELS[mode]}${mode === 'crossfade' ? ` · 겹침 ${(guild.crossfadeMs / 1000).toFixed(1)}초` : ''}`,
		`-# AutoMix 기준: 최대 템포 변경 ${(guild.automixMaxTempoChange * 100).toFixed(1)}%, 최소 신뢰도 ${guild.automixMinConfidence.toFixed(2)}`,
		`**갭리스**: ${onOff(guild.gaplessEnabled)}`,
		`**볼륨 정규화**: ${onOff(guild.normalizationEnabled)}`,
		`**음성 안내 방식**: ${ANNOUNCE_MODE_LABELS[normalizeAnnounceMode(guild.ttsAnnounceMode)]}`
	].join('\n');
}

function aiText(guild: Guild, ctx: SettingsViewContext): string {
	const mode = normalizeAiMode(guild.aiMode);
	const lines = [
		`### ${emoji('robot')} AI 채팅 설정`,
		`봇을 멘션해서 대화를 시작해요. 이 채널의 대화 문맥은 참여자들이 함께 사용해요.`,
		``,
		`**서버**: ${mode === 'channels' ? `특정 채널 (${guild.aiChannelIds.length}개)` : AI_MODE_LABELS[mode]}`
	];
	if (ctx.channelId) {
		const active = isChannelToggleEnabled({ mode, channelIds: guild.aiChannelIds }, ctx.channelId);
		lines.push(`**이 채널** <#${ctx.channelId}>: ${active ? '🟢 사용 가능' : '🔴 꺼짐'}`);
	}
	if (mode === 'channels') lines.push(`-# 특정 채널로 쓸 채널은 대시보드의 AI 탭에서 골라요.`);
	return lines.join('\n');
}

function chatToolsText(guild: Guild, ctx: SettingsViewContext): string {
	const lines = [
		`### ${emoji('sparkle')} 채팅 유틸·카운팅 설정`,
		ctx.channelId ? `기능 켜기/끄기는 이 채널(<#${ctx.channelId}>)에 적용돼요.` : '기능 켜기/끄기는 패널이 열린 채널에 적용돼요.',
		``
	];
	for (const tool of ['emojiEnlarge', 'quote', 'embedFix'] as const) {
		lines.push(`**${CHAT_TOOL_LABELS[tool]}**: ${chatToolEnabledIn(guild, tool, ctx.channelId) ? '🟢 켜짐' : '🔴 꺼짐'}`);
	}
	if (chatToolEnabledIn(guild, 'embedFix', ctx.channelId) && normalizeEmbedFixSites(guild.embedFixSites).length === 0) {
		lines.push(`-# 복구할 사이트가 전부 꺼져 있어요. 대시보드 채팅 유틸 탭에서 사이트를 골라 주세요.`);
	}
	lines.push(`**카운팅**: ${guild.countingEnabled && guild.countingChannelId ? `<#${guild.countingChannelId}>` : '꺼짐'}`);
	lines.push(`-# 카운팅 채널을 고르면 1부터 새로 시작해요.`);
	return lines.join('\n');
}
