import { describe, expect, it } from 'vitest';
import { ButtonStyle } from 'discord.js';
import {
	TTS_VOICE_DEFAULT_VALUE,
	buildVoiceOptions,
	ttsModalPrefix,
	ttsPanelView,
	ttsPitchCustomId,
	ttsResetCustomId,
	ttsSpeedCustomId,
	ttsToggleCustomId,
	ttsVoiceSelectCustomId,
	type TtsPanelProps
} from './ttsView.ts';
import type { TtsUserPreset } from '../../../services/ttsUserSettings.ts';
import type { TtsVoice } from '../../../services/ttsService.ts';

const DEFAULT_PRESET: TtsUserPreset = { enabled: false, voice: null, speed: null, pitch: null };

function voice(id: string, name = id, engine = 'edge'): TtsVoice {
	return { id, engine, name, languages: ['ko-KR'] };
}

interface PlainComponent {
	type: number;
	content?: string;
	disabled?: boolean;
	label?: string;
	style?: number;
	custom_id?: string;
	options?: Array<{ label: string; value: string; description?: string; default?: boolean }>;
	components?: PlainComponent[];
}

function panelJson(props: TtsPanelProps): PlainComponent {
	return ttsPanelView(props).toJSON() as unknown as PlainComponent;
}

function textsOf(json: PlainComponent): string[] {
	return (json.components ?? []).filter((c) => c.type === 10).map((c) => c.content ?? '');
}

function rowsOf(json: PlainComponent): PlainComponent[][] {
	return (json.components ?? []).filter((c) => c.type === 1).map((row) => row.components ?? []);
}

describe('ttsPanelView', () => {
	it('꺼짐 상태에서는 켜기 버튼을 Success로 보이고, 기본 프리셋이면 복구 버튼을 비활성화한다', () => {
		const json = panelJson({ preset: DEFAULT_PRESET, voices: [], serviceReady: true });
		const [selectRow, actionRow, resetRow] = rowsOf(json);

		expect(selectRow[0].custom_id).toBe(ttsVoiceSelectCustomId);
		expect(actionRow[0].custom_id).toBe(ttsToggleCustomId);
		expect(actionRow[0].label).toBe('낭독 켜기');
		expect(actionRow[0].style).toBe(ButtonStyle.Success);
		expect(actionRow[1].custom_id).toBe(ttsSpeedCustomId);
		expect(actionRow[2].custom_id).toBe(ttsPitchCustomId);
		expect(resetRow[0].custom_id).toBe(ttsResetCustomId);
		expect(resetRow[0].disabled).toBe(true);
	});

	it('켜짐 상태와 커스텀 프리셋이면 끄기 버튼(Danger)과 활성화된 복구 버튼을 보인다', () => {
		const json = panelJson({ preset: { enabled: true, voice: 'edge:ko-1', speed: 1.5, pitch: -2 }, voices: [], serviceReady: true });
		const [, actionRow, resetRow] = rowsOf(json);

		expect(actionRow[0].label).toBe('낭독 끄기');
		expect(actionRow[0].style).toBe(ButtonStyle.Danger);
		expect(resetRow[0].disabled).toBe(false);
	});

	it('상태 본문에 음성·속도·피치 값을 보여 준다', () => {
		const withValues = textsOf(
			panelJson({
				preset: { enabled: true, voice: 'edge:ko-1', speed: 1.5, pitch: -2 },
				voices: [voice('edge:ko-1', 'Nayeon')],
				serviceReady: true
			})
		).join('\n');
		expect(withValues).toContain('켜짐');
		expect(withValues).toContain('Nayeon (edge)');
		expect(withValues).toContain('1.5x');
		expect(withValues).toContain('-2');

		const withDefaults = textsOf(panelJson({ preset: DEFAULT_PRESET, voices: [], serviceReady: true })).join('\n');
		expect(withDefaults).toContain('꺼짐');
		expect(withDefaults).toContain('기본값');
	});

	it('서비스가 준비되지 않았을 때만 준비 안내를 붙인다', () => {
		const ready = textsOf(panelJson({ preset: DEFAULT_PRESET, voices: [], serviceReady: true })).join('\n');
		expect(ready).not.toContain('준비되지 않았어요');

		const notReady = textsOf(panelJson({ preset: DEFAULT_PRESET, voices: [], serviceReady: false })).join('\n');
		expect(notReady).toContain('준비되지 않았어요');
	});
});

describe('buildVoiceOptions', () => {
	it('음성이 없으면 기본 음성 옵션만 두고, 현재 선택으로 표시한다', () => {
		const options = buildVoiceOptions(DEFAULT_PRESET, []).map((option) => option.toJSON());
		expect(options).toHaveLength(1);
		expect(options[0].value).toBe(TTS_VOICE_DEFAULT_VALUE);
		expect(options[0].default).toBe(true);
	});

	it('카탈로그 음성 중 현재 선택에 해당하는 옵션을 default로 표시한다', () => {
		const options = buildVoiceOptions({ ...DEFAULT_PRESET, voice: 'edge:ko-2' }, [voice('edge:ko-1', 'A'), voice('edge:ko-2', 'B')]).map(
			(option) => option.toJSON()
		);
		expect(options.map((option) => option.value)).toEqual([TTS_VOICE_DEFAULT_VALUE, 'edge:ko-1', 'edge:ko-2']);
		expect(options.find((option) => option.value === 'edge:ko-2')?.default).toBe(true);
		expect(options.find((option) => option.value === TTS_VOICE_DEFAULT_VALUE)?.default).toBe(false);
	});

	it('목록에 없는 저장된 음성은 현재 선택을 위해 끝에 붙인다', () => {
		const options = buildVoiceOptions({ ...DEFAULT_PRESET, voice: 'edge:gone' }, [voice('edge:ko-1')]).map((option) => option.toJSON());
		expect(options.at(-1)?.value).toBe('edge:gone');
		expect(options.at(-1)?.default).toBe(true);
	});

	it('옵션 개수는 Discord 한도 25개를 넘지 않는다', () => {
		const many = Array.from({ length: 100 }, (_, index) => voice(`edge:ko-${index}`, `Voice ${index}`));
		const options = buildVoiceOptions({ ...DEFAULT_PRESET, voice: 'edge:missing' }, many);
		expect(options.length).toBeLessThanOrEqual(25);
	});
});

describe('customId 계약', () => {
	it('패널 컴포넌트 customId가 핸들러 prefix 계약과 맞는다', () => {
		const json = panelJson({ preset: DEFAULT_PRESET, voices: [], serviceReady: true });
		const customIds = rowsOf(json)
			.flat()
			.map((component) => component.custom_id ?? '');

		expect(customIds).toContain(ttsVoiceSelectCustomId);
		expect(customIds).toContain(ttsToggleCustomId);
		expect(customIds).toContain(ttsSpeedCustomId);
		expect(customIds).toContain(ttsPitchCustomId);
		expect(customIds).toContain(ttsResetCustomId);
		for (const customId of customIds) {
			expect(customId.startsWith('tts:panel:') || customId.startsWith(ttsModalPrefix)).toBe(true);
		}
	});
});
