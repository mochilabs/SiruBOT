import { SeparatorSpacingSize } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { DEFAULT_COLOR } from './constants.js';
import { addSeparator, createContainer, createSeparator, createThumbnail, hexColorToInt } from './embed.ts';

describe('hexColorToInt', () => {
	it("'#RRGGBB'를 0xRRGGBB 숫자로 변환해요", () => {
		expect(hexColorToInt('#ffdaff')).toBe(0xffdaff);
		expect(hexColorToInt('#000000')).toBe(0);
		expect(hexColorToInt('#FFFFFF')).toBe(0xffffff);
	});

	it('형식이 아니면 undefined — 호출부는 기본색으로 폴백해요', () => {
		expect(hexColorToInt('ffdaff')).toBeUndefined(); // # 없음
		expect(hexColorToInt('#fff')).toBeUndefined(); // 3자리
		expect(hexColorToInt('#gggggg')).toBeUndefined(); // 비hex
		expect(hexColorToInt('')).toBeUndefined();
	});
});

describe('createContainer', () => {
	it('강조색이 없거나 null이면 봇 기본색을 써요', () => {
		expect(createContainer().toJSON().accent_color).toBe(DEFAULT_COLOR);
		expect(createContainer(null).toJSON().accent_color).toBe(DEFAULT_COLOR);
	});

	it('강조색이 유효한 HEX면 그 색을 써요', () => {
		expect(createContainer('#123456').toJSON().accent_color).toBe(0x123456);
	});

	it('강조색 형식이 틀리면 기본색으로 폴백해요', () => {
		expect(createContainer('not-a-color').toJSON().accent_color).toBe(DEFAULT_COLOR);
	});
});

describe('createSeparator/addSeparator', () => {
	it('구분선은 divider+Small 간격을 써요', () => {
		const json = createSeparator().toJSON();
		expect(json.divider).toBe(true);
		expect(json.spacing).toBe(SeparatorSpacingSize.Small);
	});

	it('addSeparator는 컨테이너에 구분선 컴포넌트를 1개 추가해요', () => {
		const container = createContainer();
		addSeparator(container);
		expect(container.toJSON().components).toHaveLength(1);
	});
});

describe('createThumbnail', () => {
	it('URL을 그대로 심어요', () => {
		expect(createThumbnail('https://example.com/a.png').toJSON().media.url).toBe('https://example.com/a.png');
	});
});
