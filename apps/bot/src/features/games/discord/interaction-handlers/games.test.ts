import { describe, expect, it, vi } from 'vitest';
import GamesInteractionHandler from './games.ts';
import { rpsChoiceView, rpsResultView } from '../views/rps.ts';
import { gameId } from '../customIds.ts';

vi.mock('@sapphire/framework', () => ({
	InteractionHandler: class {
		container = {
			gameRecords: { getRpsStats: vi.fn(async () => ({ streak: 0, best: 0 })), recordGameResult: vi.fn(async () => undefined) }
		};
		some = (value?: unknown) => ({ isSome: () => true, unwrap: () => value });
		none = () => ({ isSome: () => false });
	},
	InteractionHandlerTypes: { MessageComponent: 'message-component' }
}));

function ids(container: { toJSON(): unknown }): string[] {
	return [...JSON.stringify(container.toJSON()).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]!);
}

const handler = new GamesInteractionHandler({} as never, {} as never);
const parse = (customId: string) => {
	const parsed = handler.parse({ customId } as never);
	return parsed.isSome() ? (parsed.unwrap() as unknown) : null;
};

describe('game custom ids', () => {
	it('parses every button the rps views render', () => {
		const choice = ids(rpsChoiceView('시루')).map(parse);
		expect(choice).toEqual([
			{ action: 'rps', pick: 0 },
			{ action: 'rps', pick: 1 },
			{ action: 'rps', pick: 2 }
		]);
		expect(ids(rpsResultView('시루', 0, 1, null)).map(parse)).toEqual([{ action: 'rpsAgain' }]);
		expect(gameId.encode('rps', { pick: 2 })).toBe('game:v1:rps:2');
	});

	it('runs a pick through the handler and updates the message', async () => {
		const interaction = { user: { id: '100000000000000001', displayName: '시루' }, deferUpdate: vi.fn(), editReply: vi.fn() };
		await handler.run(interaction as never, parse(gameId.encode('rps', { pick: 1 })) as never);
		expect(interaction.deferUpdate).toHaveBeenCalledOnce();
		expect(interaction.editReply).toHaveBeenCalledOnce();
	});

	it.each(['game:rps:0', 'game:rps:again', 'game:v2:rps:0', 'game:v1:rps', 'game:v1:rps:x', 'ticket:v1:open'])('ignores %s', (customId) => {
		expect(parse(customId)).toBeNull();
	});
});
