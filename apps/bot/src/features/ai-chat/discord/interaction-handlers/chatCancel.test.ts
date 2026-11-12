import { describe, expect, it, vi } from 'vitest';
import { ChatCancelHandler } from './chatCancel.ts';
import { livePayload, statusPayload } from '../views/chatView.ts';
import { chatCancelId } from '../customIds.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { Button: 'button', SelectMenu: 'select-menu', MessageComponent: 'message-component', ModalSubmit: 'modal-submit' }
}));
vi.mock('@sapphire/decorators', () => ({ ApplyOptions: () => (target: unknown) => target }));
vi.mock('../../application/aiChatService.ts', () => ({ abortChatTurn: vi.fn() }));

const ctx = {} as never;
const ids = (rendered: unknown) => [...JSON.stringify(rendered).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
const parsedOf = (handler: { parse(i: never): { isSome(): boolean; unwrap?(): unknown } }, interaction: object) => {
	const parsed = handler.parse(interaction as never);
	return parsed.isSome() ? parsed.unwrap!() : null;
};

describe('ai chat custom id round trips', () => {
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
});
