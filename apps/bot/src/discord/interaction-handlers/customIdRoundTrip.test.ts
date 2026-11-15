import { describe, expect, it, vi } from 'vitest';
import { EvalModalHandler } from './evalModal.ts';
import { evalModal } from '../views/eval.ts';
import { confirmAction } from '../../lib/confirmation.ts';
import { confirmId } from '../../lib/confirmationId.ts';
import { evalId } from '../customIds.ts';

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

describe('general custom id round trips', () => {
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
