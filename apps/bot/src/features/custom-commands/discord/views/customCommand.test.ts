import { describe, expect, it } from 'vitest';
import { customCommandDesignView } from './customCommand.ts';

describe('customCommandDesignView', () => {
	it('디자인 항목을 컨테이너로 만들고 텍스트는 치환 함수를 거쳐요', () => {
		const container = customCommandDesignView(
			{ accentColor: 'blue', items: [{ kind: 'text', content: '## 공지 {argv0}' }, { kind: 'separator' }] },
			(text) => text.replace('{argv0}', '시루')
		);
		const json = JSON.stringify(container.toJSON());
		expect(json).toContain('## 공지 시루');
		expect(json).not.toContain('{argv0}');
	});
});
