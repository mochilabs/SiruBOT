import { describe, expect, it, vi } from 'vitest';
import { runCustomCommandSpec, type CustomCommandChannel } from './interpreter.ts';
import type { CustomCommandSpec } from '@sirubot/utils';

function fakeChannel(): CustomCommandChannel & { sent: string[] } {
	const sent: string[] = [];
	return {
		sent,
		async send(payload) {
			sent.push(payload.content);
		}
	};
}

function spec(steps: CustomCommandSpec['steps']): CustomCommandSpec {
	return { version: 1, steps };
}

describe('runCustomCommandSpec', () => {
	it('runs send_message steps in order', async () => {
		const channel = fakeChannel();
		const result = await runCustomCommandSpec(
			spec([
				{ type: 'send_message', text: '첫째' },
				{ type: 'send_message', text: '둘째' }
			]),
			channel
		);
		expect(result).toEqual({ kind: 'ok', sent: 2 });
		expect(channel.sent).toEqual(['첫째', '둘째']);
	});

	it('waits for delay steps between messages', async () => {
		vi.useFakeTimers();
		try {
			const channel = fakeChannel();
			const run = runCustomCommandSpec(
				spec([
					{ type: 'send_message', text: 'a' },
					{ type: 'delay', seconds: 5 },
					{ type: 'send_message', text: 'b' }
				]),
				channel
			);
			await vi.advanceTimersByTimeAsync(4_999);
			expect(channel.sent).toEqual(['a']);
			await vi.advanceTimersByTimeAsync(1);
			const result = await run;
			expect(result).toEqual({ kind: 'ok', sent: 2 });
			expect(channel.sent).toEqual(['a', 'b']);
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects specs failing the schema (wrong version / unknown step)', async () => {
		const channel = fakeChannel();
		expect(await runCustomCommandSpec({ version: 2, steps: [] }, channel)).toEqual({ kind: 'invalid_spec' });
		expect(await runCustomCommandSpec({ version: 1, steps: [{ type: 'play_music', query: 'x' }] }, channel)).toEqual({ kind: 'invalid_spec' });
		expect(channel.sent).toEqual([]);
	});

	it('stops remaining steps when a send fails', async () => {
		let call = 0;
		const channel: CustomCommandChannel & { sent: string[] } = {
			sent: [],
			async send(payload) {
				call++;
				if (call === 2) throw new Error('channel deleted');
				this.sent.push(payload.content);
			}
		};
		const result = await runCustomCommandSpec(
			spec([
				{ type: 'send_message', text: 'a' },
				{ type: 'send_message', text: 'b' },
				{ type: 'send_message', text: 'c' }
			]),
			channel
		);
		expect(result.kind).toBe('send_failed');
		expect(result).toMatchObject({ sent: 1 });
		expect(channel.sent).toEqual(['a']);
	});
});
