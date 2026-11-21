import { describe, expect, it, vi } from 'vitest';
import TicketButtonHandler from './ticketButton.ts';
import { ticketPanelView, ticketWelcomeView } from '../views/ticket.ts';
import { ticketId } from '../customIds.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { Button: 'button' }
}));
vi.mock('@sirubot/utils', async (importOriginal) => ({
	...(await importOriginal<typeof import('@sirubot/utils')>()),
	emoji: (name: string) => name
}));

function ids(view: { components: { toJSON(): unknown }[] }): string[] {
	return [...JSON.stringify(view.components.map((component) => component.toJSON())).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
}

const handler = new TicketButtonHandler({} as never, {} as never);
const parse = (customId: string) => handler.parse({ customId, inCachedGuild: () => true } as never);

describe('ticket custom ids', () => {
	it('every button the views render is decoded by the handler', () => {
		const panel = ids(ticketPanelView({ panelTitle: 't', panelDescription: 'd' } as never));
		const welcome = ids(ticketWelcomeView({ ownerId: '1', ticketNumber: 1, claimedById: null } as never));
		const actions = [...panel, ...welcome].map((id) => {
			const parsed = parse(id);
			return parsed.isSome() ? (parsed.unwrap() as { action: string }).action : null;
		});
		expect(actions).toEqual(['open', 'close', 'claim']);
		expect(ticketId.encode('close')).toBe('ticket:v1:close');
	});

	it.each(['ticket:open', 'ticket:close', 'ticket:confirm_close', 'ticket:v2:open', 'ticket:v1:bogus', 'role:v1:open'])(
		'ignores %s',
		(customId) => {
			expect(parse(customId).isSome()).toBe(false);
		}
	);
});
