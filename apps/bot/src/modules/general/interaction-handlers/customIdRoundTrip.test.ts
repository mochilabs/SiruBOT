import { describe, expect, it, vi } from 'vitest';
import { TtsPanelButtonHandler } from './ttsPanelButton.ts';
import { TtsPanelSelectHandler } from './ttsPanelSelect.ts';
import { ChatCancelHandler } from './chatCancel.ts';
import { EvalModalHandler } from './evalModal.ts';
import { ttsPanelView } from '../view/ttsView.ts';
import { livePayload, statusPayload } from '../view/chatView.ts';
import { evalModal } from '../view/eval.ts';
import { confirmAction } from '../../../lib/confirmation.ts';
import { confirmId } from '../../../lib/confirmationId.ts';
import { chatCancelId, evalId } from '../customIds.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { Button: 'button', SelectMenu: 'select-menu', MessageComponent: 'message-component', ModalSubmit: 'modal-submit' }
}));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));
vi.mock('../../../services/aiChatService.ts', () => ({ abortChatTurn: vi.fn() }));

const ctx = {} as never;
const ids = (rendered: unknown) => [...JSON.stringify(rendered).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
const parsedOf = (handler: { parse(i: never): { isSome(): boolean; unwrap?(): unknown } }, interaction: object) => {
	const parsed = handler.parse(interaction as never);
	return parsed.isSome() ? parsed.unwrap!() : null;
};

describe('general custom id round trips', () => {
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

	it('the chat stop button carries its cancel key to the handler', () => {
		const key = 'a'.repeat(32);
		const handler = new ChatCancelHandler(ctx, ctx);
		for (const payload of [livePayload('답', key), statusPayload('검색 중', key)]) {
			const [customId] = ids(payload.components.map((component) => component.toJSON()));
			expect(chatCancelId.decode(customId!)).toEqual({ action: 'stop', cancelKey: key });
			expect(parsedOf(handler as never, { customId })).toEqual({ cancelKey: key });
		}
		expect(parsedOf(handler as never, { customId: `chatcancel:${key}` })).toBeNull();
	});

	it('the eval modal and its input use the declared ids', () => {
		const [modalId, inputId] = ids(evalModal().toJSON());
		expect(modalId).toBe(evalId.encode('modal'));
		expect(inputId).toBe(evalId.encode('code'));
		const handler = new EvalModalHandler(ctx, ctx);
		expect(handler.parse({ customId: modalId } as never).isSome()).toBe(true);
		expect(handler.parse({ customId: 'eval-modal' } as never).isSome()).toBe(false);
	});

	it.each([
		['yes', true],
		['no', false]
	] as const)('confirmAction resolves %s from the buttons its own view rendered', async (action, expected) => {
		let renderedIds: string[] = [];
		const selection = { customId: '', update: vi.fn() };
		const message = {
			awaitMessageComponent: vi.fn(async ({ filter }: { filter: (button: unknown) => boolean }) => {
				selection.customId = renderedIds.find((id) => confirmId.decode(id)?.action === action)!;
				const other = confirmId.encode(action, { sessionId: 'someone-elses-session' });
				expect(filter({ customId: other, user: { id: '1' } })).toBe(false);
				expect(filter({ customId: selection.customId, user: { id: '100000000000000001' } })).toBe(true);
				return selection;
			})
		};
		const interaction = {
			user: { id: '100000000000000001' },
			editReply: vi.fn(async (payload: { components: { toJSON(): unknown }[] }) => {
				renderedIds = ids(payload.components.map((component) => component.toJSON()));
				return message;
			})
		};
		expect(await confirmAction(interaction as never, '제목', '설명')).toBe(expected);
		expect(renderedIds).toHaveLength(2);
		expect(selection.update).toHaveBeenCalledOnce();
	});
});
