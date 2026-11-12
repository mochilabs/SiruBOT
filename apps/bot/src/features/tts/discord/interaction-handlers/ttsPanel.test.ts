import { describe, expect, it, vi } from 'vitest';
import { TtsPanelButtonHandler } from './ttsPanelButton.ts';
import { TtsPanelSelectHandler } from './ttsPanelSelect.ts';
import { ttsPanelView } from '../views/ttsView.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { Button: 'button', SelectMenu: 'select-menu', MessageComponent: 'message-component', ModalSubmit: 'modal-submit' }
}));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));

const ctx = {} as never;
const ids = (rendered: unknown) => [...JSON.stringify(rendered).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
const parsedOf = (handler: { parse(i: never): { isSome(): boolean; unwrap?(): unknown } }, interaction: object) => {
	const parsed = handler.parse(interaction as never);
	return parsed.isSome() ? parsed.unwrap!() : null;
};

describe('tts custom id round trips', () => {
	it('tts panel ids are claimed by the matching handler and carry the language', () => {
		const preset = { enabled: true, voice: null, channel: 'both', emotion: 'neutral' };
		const rendered = ids(ttsPanelView({ preset, voices: [], serviceReady: true, lang: 'ja' } as never).toJSON());
		const button = new TtsPanelButtonHandler(ctx, ctx);
		const select = new TtsPanelSelectHandler(ctx, ctx);
		const claimed = rendered.map((customId) => {
			const interaction = { customId, values: ['ko'], inCachedGuild: () => true };
			return { button: parsedOf(button as never, interaction), select: parsedOf(select as never, interaction) };
		});
		expect(claimed.map((entry) => entry.button !== null)).toEqual([false, false, false, false, true, true]);
		expect(claimed.map((entry) => entry.select !== null)).toEqual([true, true, true, true, false, false]);
		expect(claimed[4]!.button).toEqual({ action: 'toggle', lang: 'ja' });
		expect(claimed[1]!.select).toMatchObject({ lang: 'ja' });
		expect(claimed[0]!.select).toEqual({ patch: null, lang: 'ko' });
		expect(parsedOf(button as never, { customId: 'tts:panel:toggle:ja', inCachedGuild: () => true })).toBeNull();
	});
});
