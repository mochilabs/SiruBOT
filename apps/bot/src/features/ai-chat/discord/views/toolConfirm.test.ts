import { describe, expect, it } from 'vitest';
import { toolConfirmText } from './toolConfirm.ts';

describe('toolConfirmText', () => {
	it('설정 변경은 요약과 함께 진행 여부를 물어요', () => {
		const { title, description } = toolConfirmText({
			toolName: 'bot_settings_set',
			effect: 'settings',
			summary: '서버 봇 설정 변경\n- 고정 채널 → `음악`',
			tainted: false
		});
		expect(title).toBe('AI 요청 확인');
		expect(description).toContain('서버 설정을 바꾸려고');
		expect(description).toContain('- 고정 채널 → `음악`');
		expect(description).toContain('진행할까요?');
		expect(description).not.toContain('웹 내용');
	});

	it('외부 내용이 섞인 턴이면 웹 내용의 영향일 수 있다고 알려요', () => {
		const { description } = toolConfirmText({
			toolName: 'music_stop',
			effect: 'music',
			summary: '재생을 멈추고 음성 채널에서 내보내기',
			tainted: true
		});
		expect(description).toContain('음악을 제어하려고');
		expect(description).toContain('웹 내용의 영향');
	});
});
