import { describe, expect, it } from 'vitest';
import { mojiId } from '../customIds.ts';
import { emojiMakerView } from './emojiMaker.ts';

type Json = ReturnType<ReturnType<typeof emojiMakerView>['toJSON']>;
type Interactive = {
	type: number;
	custom_id: string;
	disabled?: boolean;
	placeholder?: string;
	label?: string;
	options?: Array<{ label: string; value: string }>;
};

const interactive = (json: Json) => json.components.flatMap((c) => ('components' in c && c.type === 1 ? (c.components as Interactive[]) : []));
const selectOf = (json: Json) => interactive(json).find((c) => c.type === 3)!;
const rerollOf = (json: Json) => interactive(json).find((c) => c.type === 2)!;

describe('emojiMakerView', () => {
	const base = {
		description: '선글라스 낀 고양이',
		translatedPrompt: 'cat wearing sunglasses',
		fromImage: false,
		candidateCount: 4,
		registered: new Map<number, string>()
	};

	it('renders a gallery, a candidate select and a reroll button the session can decode', () => {
		const json = emojiMakerView({ ...base, phase: 'active' }).toJSON();
		const gallery = json.components.find((c) => c.type === 12) as { items: Array<{ media: { url: string } }> };
		expect(gallery.items.map((i) => i.media.url)).toEqual([
			'attachment://moji-1.png',
			'attachment://moji-2.png',
			'attachment://moji-3.png',
			'attachment://moji-4.png'
		]);
		const select = selectOf(json);
		expect(mojiId.decode(select.custom_id)).toEqual({ action: 'pick' });
		expect(select.options?.map((o) => [o.label, o.value])).toEqual([
			['1번 후보', '0'],
			['2번 후보', '1'],
			['3번 후보', '2'],
			['4번 후보', '3']
		]);
		expect(select.disabled).toBe(false);
		expect(mojiId.decode(rerollOf(json).custom_id)).toEqual({ action: 'reroll' });
	});

	it('drops registered candidates and locks the menu once all are registered', () => {
		const one = new Map([[1, '<:cat:123456789012345678>']]);
		expect(selectOf(emojiMakerView({ ...base, registered: one, phase: 'active' }).toJSON()).options?.map((o) => o.value)).toEqual([
			'0',
			'2',
			'3'
		]);
		const all = new Map([0, 1, 2, 3].map((i) => [i, `<:c${i}:123456789012345678>`]));
		const select = selectOf(emojiMakerView({ ...base, registered: all, phase: 'active' }).toJSON());
		expect(select).toMatchObject({ disabled: true, placeholder: '모든 후보를 등록했어요' });
	});

	it('disables everything when expired and shows the model credit', () => {
		const json = emojiMakerView({ ...base, phase: 'expired' }).toJSON();
		expect(interactive(json).every((c) => c.disabled)).toBe(true);
		expect(JSON.stringify(json)).toContain('-# Tessera-small (CC BY-NC 4.0)');
		expect(JSON.stringify(json)).not.toContain('로 그렸어요');
	});

	it('labels drawings made from an attached image', () => {
		const text = JSON.stringify(
			emojiMakerView({ ...base, description: '', fromImage: true, translatedPrompt: 'orange cat', phase: 'active' }).toJSON()
		);
		expect(text).toContain('📎 첨부한 이미지');
		expect(text).toContain('이미지를 보고 이렇게 그렸어요: orange cat');
		expect(text).not.toContain('영어로 옮겨서');
	});
});
