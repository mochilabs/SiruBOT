import { describe, expect, it } from 'vitest';
import { mojiId } from '../customIds.ts';
import { emojiMakerView } from './emojiMaker.ts';

function buttons(json: ReturnType<ReturnType<typeof emojiMakerView>['toJSON']>) {
	return json.components.flatMap((c) => ('components' in c && c.type === 1 ? c.components : [])) as Array<{
		custom_id: string;
		label: string;
		disabled?: boolean;
	}>;
}

describe('emojiMakerView', () => {
	const base = {
		description: '선글라스 낀 고양이',
		translatedPrompt: 'cat wearing sunglasses',
		candidateCount: 4,
		registered: new Map<number, string>()
	};

	it('renders a gallery of attachments and register/reroll buttons the session can decode', () => {
		const json = emojiMakerView({ ...base, phase: 'active' }).toJSON();
		const gallery = json.components.find((c) => c.type === 12) as { items: Array<{ media: { url: string } }> };
		expect(gallery.items.map((i) => i.media.url)).toEqual([
			'attachment://moji-1.png',
			'attachment://moji-2.png',
			'attachment://moji-3.png',
			'attachment://moji-4.png'
		]);
		const decoded = buttons(json).map((b) => mojiId.decode(b.custom_id));
		expect(decoded).toEqual([
			{ action: 'register', index: 0 },
			{ action: 'register', index: 1 },
			{ action: 'register', index: 2 },
			{ action: 'register', index: 3 },
			{ action: 'reroll' }
		]);
		expect(buttons(json).every((b) => !b.disabled)).toBe(true);
	});

	it('marks registered candidates and disables everything when expired', () => {
		const registered = new Map([[1, '<:cat:123456789012345678>']]);
		const active = buttons(emojiMakerView({ ...base, registered, phase: 'active' }).toJSON());
		expect(active[1]).toMatchObject({ label: '2번 등록됨', disabled: true });
		expect(active[0]?.disabled).toBe(false);
		const expired = buttons(emojiMakerView({ ...base, registered, phase: 'expired' }).toJSON());
		expect(expired.every((b) => b.disabled)).toBe(true);
	});
});
