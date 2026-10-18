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
import type { TtsUserPreset, TtsUserSettingsService } from '../../../services/ttsUserSettings.ts';

/**
 * /tts 설정 패널(Components V2) 뷰와 컴포넌트 customId 계약.
 * 상호작용은 `modules/general/interaction-handlers/ttsPanel.ts`(버튼·셀렉트)와
 * `ttsPanelModal.ts`(속도·피치 모달)가 파싱한다. 패널 응답은 전부 ephemeral이라
 * 상호작용은 작성자만 가능하다.
 */

export const ttsPanelPrefix = 'tts:panel:';
export const ttsToggleCustomId = `${ttsPanelPrefix}toggle`;
export const ttsSpeedCustomId = `${ttsPanelPrefix}speed`;
export const ttsPitchCustomId = `${ttsPanelPrefix}pitch`;
export const ttsResetCustomId = `${ttsPanelPrefix}reset`;
export const ttsVoiceSelectCustomId = `${ttsPanelPrefix}voice`;
export const ttsModalPrefix = 'tts:modal:';

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
}

function truncate(text: string, maxLength: number): string {
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function speedLabel(speed: number | null): string {
	return speed !== null ? `${speed}x` : '기본값';
}

function pitchLabel(pitch: number | null): string {
	if (pitch === null) return '기본값';
	return pitch > 0 ? `+${pitch}` : String(pitch);
}

function voiceLabel(preset: TtsUserPreset, voices: TtsVoice[]): string {
	if (preset.voice === null) return '기본 음성';
	const match = voices.find((voice) => voice.id === preset.voice);
	if (!match) return truncate(preset.voice, 60);
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
				.setLabel(truncate(voice.name, 100))
				.setValue(voice.id)
				.setDescription(truncate(detail || '사용자 지정 음성', 100))
				.setDefault(preset.voice === voice.id)
		);
	}

	// 목록에 없지만 저장된 음성은 현재 선택을 표시하기 위해 끝에 붙인다.
	if (currentMissing && preset.voice !== null) {
		options.push(
			new StringSelectMenuOptionBuilder()
				.setLabel(truncate(preset.voice, 100))
				.setValue(preset.voice)
				.setDescription('현재 설정된 음성이에요')
				.setDefault(true)
		);
	}

	return options;
}

export function ttsPanelView({ preset, voices, serviceReady }: TtsPanelProps): ContainerBuilder {
	const container = createContainer();

	const statusLines = [
		`${preset.enabled ? '🟢' : '⚪'} **낭독** · ${preset.enabled ? '켜짐' : '꺼짐'}`,
		`**음성** · ${voiceLabel(preset, voices)}`,
		`**속도** · ${speedLabel(preset.speed)}`,
		`**피치** · ${pitchLabel(preset.pitch)}`
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
				.setCustomId(ttsVoiceSelectCustomId)
				.setPlaceholder('낭독에 사용할 음성을 선택하세요')
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(buildVoiceOptions(preset, voices))
		)
	);

	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(ttsToggleCustomId)
				.setEmoji(emoji(preset.enabled ? 'volume_muted' : 'volume_up'))
				.setLabel(preset.enabled ? '낭독 끄기' : '낭독 켜기')
				.setStyle(preset.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
			new ButtonBuilder().setCustomId(ttsSpeedCustomId).setEmoji(emoji('clock')).setLabel('속도').setStyle(ButtonStyle.Secondary),
			new ButtonBuilder().setCustomId(ttsPitchCustomId).setEmoji(emoji('music_note')).setLabel('피치').setStyle(ButtonStyle.Secondary)
		)
	);

	const isDefaultPreset = preset.voice === null && preset.speed === null && preset.pitch === null;
	container.addActionRowComponents(
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(ttsResetCustomId)
				.setEmoji(emoji('repeat'))
				.setLabel('기본값 복구')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(isDefaultPreset)
		)
	);

	const notes = [
		'-# 서버 정책에 따라 읽지 않는 채널에서는 읽히지 않아요. 정책은 관리자가 설정해요.',
		...(serviceReady ? [] : ['-# 봇의 TTS 서비스가 아직 준비되지 않았어요. 관리자가 설정 중이에요.'])
	];
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(notes.join('\n')));

	return container;
}

export interface TtsPanelDeps {
	ttsUserSettings: TtsUserSettingsService;
	ttsService: TtsService;
}

/** 패널에 표시할 최신 설정·음성 목록을 모아 뷰를 만든다. 명령어와 버튼/셀렉트/모달 핸들러가 함께 쓴다. */
export async function buildTtsPanel(deps: TtsPanelDeps, guildId: string, userId: string): Promise<ContainerBuilder> {
	const [preset, voices] = await Promise.all([deps.ttsUserSettings.get(guildId, userId), deps.ttsService.listVoices()]);
	return ttsPanelView({ preset, voices, serviceReady: deps.ttsService.isEnabled() });
}
