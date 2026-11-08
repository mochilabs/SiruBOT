import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	SeparatorBuilder,
	SeparatorSpacingSize,
	StringSelectMenuBuilder,
	StringSelectMenuOptionBuilder,
	TextDisplayBuilder,
	type ContainerBuilder
} from 'discord.js';
import { createContainer, emoji } from '@sirubot/utils';
import type { TtsService, TtsVoice } from '../../../services/ttsService.ts';
import type { TtsChannel, TtsUserPreset, TtsUserSettingsService } from '../../../services/ttsUserSettings.ts';
import { truncateText } from '../../../lib/text.ts';
import type { GuildService } from '../../../services/guildService.ts';

/**
 * /tts 설정 패널(Components V2) 뷰와 컴포넌트 customId 계약.
 * 상호작용은 `modules/general/interaction-handlers/ttsPanelButton.ts`(버튼),
 * `ttsPanelSelect.ts`(음성·위치 셀렉트)가 파싱한다.
 * 패널 응답은 전부 ephemeral이라 상호작용은 작성자만 가능하다.
 */

export const ttsPanelPrefix = 'tts:panel:';
export const ttsToggleCustomId = `${ttsPanelPrefix}toggle`;
export const ttsChannelSelectCustomId = `${ttsPanelPrefix}channel`;
export const ttsResetCustomId = `${ttsPanelPrefix}reset`;
export const ttsVoiceSelectCustomId = `${ttsPanelPrefix}voice`;
export const ttsLangSelectCustomId = `${ttsPanelPrefix}lang`;

/** 음성 목록 언어 선택지 — siru_tts `/v1/voices?lang=`에 그대로 넘기는 코드 */
export const TTS_PANEL_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
	{ code: 'ko', label: '한국어' },
	{ code: 'ja', label: '일본어' },
	{ code: 'en', label: '영어' },
	{ code: 'zh', label: '중국어' },
	{ code: 'fr', label: '프랑스어' },
	{ code: 'es', label: '스페인어' },
	{ code: 'de', label: '독일어' },
	{ code: 'ru', label: '러시아어' }
];
export const TTS_PANEL_DEFAULT_LANG = 'ko';

export function normalizePanelLang(value: string | null | undefined): string {
	return TTS_PANEL_LANGUAGES.some((language) => language.code === value) ? (value as string) : TTS_PANEL_DEFAULT_LANG;
}

/** 패널을 다시 그려도 보던 언어가 유지되도록 customId 끝에 언어 코드를 붙인다 (`tts:panel:voice:ja`) */
export function withPanelLang(customId: string, lang: string): string {
	return `${customId}:${normalizePanelLang(lang)}`;
}

/** `withPanelLang`의 역 — 접두 customId와 언어 코드를 분리한다 */
export function splitPanelLang(customId: string): { base: string; lang: string } {
	const index = customId.lastIndexOf(':');
	if (index <= ttsPanelPrefix.length - 1) return { base: customId, lang: TTS_PANEL_DEFAULT_LANG };
	return { base: customId.slice(0, index), lang: normalizePanelLang(customId.slice(index + 1)) };
}

/** 셀렉트에서 "기본 음성(preset.voice = null)"을 나타내는 값. 실제 음성 id와 겹치지 않도록 밑줄로 감싼다. */
export const TTS_VOICE_DEFAULT_VALUE = '__default__';

/** 셀렉트 옵션 최대 개수(Discord 한도). 기본 음성 + 카탈로그 + 저장된 음성 표시를 감안해 카탈로그는 24개까지만 넣는다. */
const TTS_VOICE_OPTION_LIMIT = 25;

export interface TtsPanelProps {
	preset: TtsUserPreset;
	/** `ttsService.listVoices()` 첫 페이지. 비어 있으면 셀렉트에 기본 음성만 보인다. */
	voices: TtsVoice[];
	/** SIRU_TTS_* 설정 여부. 꺼져 있으면 준비 안내를 붙인다. */
	serviceReady: boolean;
	/** 음성 목록에 보여주는 언어 코드 */
	lang: string;
}

const CHANNEL_LABELS: Record<TtsChannel, { label: string; description: string }> = {
	left: { label: '왼쪽', description: '왼쪽 스피커로만 들려요' },
	both: { label: '가운데', description: '양쪽 스피커로 똑같이 들려요' },
	right: { label: '오른쪽', description: '오른쪽 스피커로만 들려요' }
};

function channelLabel(channel: TtsChannel): string {
	return CHANNEL_LABELS[channel].label;
}

export function buildChannelOptions(preset: TtsUserPreset): StringSelectMenuOptionBuilder[] {
	return (Object.keys(CHANNEL_LABELS) as TtsChannel[]).map((channel) =>
		new StringSelectMenuOptionBuilder()
			.setLabel(CHANNEL_LABELS[channel].label)
			.setValue(channel)
			.setDescription(CHANNEL_LABELS[channel].description)
			.setDefault(preset.channel === channel)
	);
}

function voiceLabel(preset: TtsUserPreset, voices: TtsVoice[]): string {
	if (preset.voice === null) return '기본 음성';
	const match = voices.find((voice) => voice.id === preset.voice);
	if (!match) return truncateText(preset.voice, 60);
	return match.engine ? `${match.name} (${match.engine})` : match.name;
}

export function buildVoiceOptions(preset: TtsUserPreset, voices: TtsVoice[]): StringSelectMenuOptionBuilder[] {
	const catalog = voices.filter((voice) => voice.id.length > 0 && voice.id !== TTS_VOICE_DEFAULT_VALUE).slice(0, TTS_VOICE_OPTION_LIMIT - 1);
	const currentMissing = preset.voice !== null && !catalog.some((voice) => voice.id === preset.voice);
	const shown = currentMissing ? catalog.slice(0, TTS_VOICE_OPTION_LIMIT - 2) : catalog;

	const options = [
		new StringSelectMenuOptionBuilder()
			.setLabel('기본 음성')
			.setValue(TTS_VOICE_DEFAULT_VALUE)
			.setDescription('봇 기본 음성을 사용해요')
			.setDefault(preset.voice === null)
	];

	for (const voice of shown) {
		const detail = [voice.engine, voice.languages[0]].filter(Boolean).join(' · ');
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(truncateText(voice.name, 100))
				.setValue(voice.id)
				.setDescription(truncateText(detail || '사용자 지정 음성', 100))
				.setDefault(preset.voice === voice.id)
		);
	}

	// 목록에 없지만 저장된 음성은 현재 선택을 표시하기 위해 끝에 붙인다.
	if (currentMissing && preset.voice !== null) {
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(truncateText(preset.voice, 100))
				.setValue(preset.voice)
				.setDescription('현재 설정된 음성이에요')
				.setDefault(true)
		);
	}

	return options;
}

export function ttsPanelView({ preset, voices, serviceReady, lang }: TtsPanelProps): ContainerBuilder {
	const container = createContainer();

	const statusLines = [
		`${preset.enabled ? '🟢' : '⚪'} **낭독** · ${preset.enabled ? '켜짐' : '꺼짐'}`,
		`**음성** · ${voiceLabel(preset, voices)}`,
		`**위치** · ${channelLabel(preset.channel)}`
	];

	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(
			[
				`### ${emoji('speech')} 채팅 TTS 설정`,
				'서버 채팅에서 내가 쓴 메시지를 음성으로 읽어 드려요. 이 설정은 나에게만 적용돼요.',
				'',
				...statusLines
			].join('\n')
		)
	);

	container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

	container.addActionRowComponents(
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(withPanelLang(ttsLangSelectCustomId, lang))
				.setPlaceholder('음성 목록의 언어를 선택하세요')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(
					TTS_PANEL_LANGUAGES.map((language) =>
						new StringSelectMenuOptionBuilder()
							.setLabel(language.label)
							.setValue(language.code)
							.setDefault(language.code === lang)
					)
				)
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(withPanelLang(ttsVoiceSelectCustomId, lang))
				.setPlaceholder('낭독에 사용할 음성을 선택하세요')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(buildVoiceOptions(preset, voices))
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(withPanelLang(ttsChannelSelectCustomId, lang))
				.setPlaceholder('음성이 들릴 위치를 선택하세요')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(buildChannelOptions(preset))
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(withPanelLang(ttsToggleCustomId, lang))
				.setEmoji(emoji(preset.enabled ? 'volume_muted' : 'volume_up'))
				.setLabel(preset.enabled ? '낭독 끄기' : '낭독 켜기')
				.setStyle(preset.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
		)
	);

	const isDefaultPreset = preset.voice === null && preset.channel === 'both';
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(withPanelLang(ttsResetCustomId, lang))
				.setEmoji(emoji('repeat'))
				.setLabel('기본값 복구')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(isDefaultPreset)
		)
	);

	const notes = [
		'-# 서버 정책에 따라 읽지 않는 채널에서는 읽히지 않아요. 위치는 음악 위에 겹쳐 읽을 때 적용돼요.',
		'-# 고른 음성이 읽을 수 없는 언어의 글은 그 언어에 맞는 다른 음성으로 읽어요.',
		...(serviceReady ? [] : ['-# 봇의 TTS 서비스가 아직 준비되지 않았어요. 관리자가 설정 중이에요.'])
	];
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(notes.join('\n')));

	return container;
}

export interface TtsPanelDeps {
	ttsUserSettings: TtsUserSettingsService;
	ttsService: TtsService;
	guildService: GuildService;
}

/** 패널에 표시할 최신 설정·음성 목록을 모아 뷰를 만든다. 명령어와 버튼/셀렉트/모달 핸들러가 함께 쓴다. */
export async function buildTtsPanel(
	deps: TtsPanelDeps,
	guildId: string,
	userId: string,
	channelId: string | null,
	lang: string = TTS_PANEL_DEFAULT_LANG
): Promise<ContainerBuilder> {
	const panelLang = normalizePanelLang(lang);
	const [preset, voices, policy] = await Promise.all([
		deps.ttsUserSettings.get(guildId, userId),
		deps.ttsService.listVoices({ lang: panelLang }),
		deps.guildService.getTtsSettings(guildId)
	]);
	const active = policy.mode === 'all' || (policy.mode === 'channels' && channelId !== null && policy.channelIds.includes(channelId));
	const view = ttsPanelView({ preset, voices, serviceReady: deps.ttsService.isEnabled(), lang: panelLang });
	view.addTextDisplayComponents((text) =>
		text.setContent(
			`**현재 채널** · ${active ? '낭독 허용' : '낭독 꺼짐'}\n${!active ? '개인 낭독을 켜도 이 채널에서는 읽지 않아요. 관리자에게 /tts 켜기를 요청해 주세요.' : !preset.enabled ? '내 메시지를 읽으려면 낭독 켜기를 눌러 주세요.' : '봇과 같은 음성 채널에 들어가면 내 메시지를 읽어요.'}`
		)
	);
	return view;
}
