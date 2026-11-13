import { describe, expect, it, vi } from 'vitest';
import type { ChatInputCommandInteraction } from 'discord.js';
import { ContainerBuilder } from 'discord.js';
import { sendComponent } from './chatInputCommandDenied.ts';

describe('sendComponent', () => {
	it('replies directly if not deferred or replied', async () => {
		const interaction = {
			deferred: false,
			replied: false,
			user: { id: 'user-1' },
			reply: vi.fn().mockResolvedValue(undefined)
		} as unknown as ChatInputCommandInteraction;

		const component = new ContainerBuilder();
		await sendComponent(interaction, component, { ephemeral: true });

		expect(interaction.reply).toHaveBeenCalledTimes(1);
	});

	it('edits directly when already deferred ephemerally', async () => {
		const interaction = {
			deferred: true,
			replied: false,
			ephemeral: true,
			user: { id: 'user-1' },
			editReply: vi.fn().mockResolvedValue(undefined),
			followUp: vi.fn().mockResolvedValue(undefined),
			deleteReply: vi.fn().mockResolvedValue(undefined)
		} as unknown as ChatInputCommandInteraction;

		const component = new ContainerBuilder();
		await sendComponent(interaction, component, { ephemeral: true });

		expect(interaction.editReply).toHaveBeenCalledTimes(1);
		expect(interaction.followUp).not.toHaveBeenCalled();
		expect(interaction.deleteReply).not.toHaveBeenCalled();
	});

	it('deletes public deferred reply before sending ephemeral followUp so deleteReply does not erase the followUp', async () => {
		const deleteReply = vi.fn().mockResolvedValue(undefined);
		const followUp = vi.fn().mockResolvedValue(undefined);
		const interaction = {
			deferred: true,
			replied: false,
			ephemeral: false,
			user: { id: 'user-1' },
			editReply: vi.fn().mockResolvedValue(undefined),
			followUp,
			deleteReply
		} as unknown as ChatInputCommandInteraction;

		const component = new ContainerBuilder();
		await sendComponent(interaction, component, { ephemeral: true });

		expect(deleteReply).toHaveBeenCalledTimes(1);
		expect(followUp).toHaveBeenCalledTimes(1);
		expect(deleteReply.mock.invocationCallOrder[0]).toBeLessThan(followUp.mock.invocationCallOrder[0]!);
		expect(interaction.editReply).not.toHaveBeenCalled();
	});

	it('edits deferred reply when non-ephemeral component requested', async () => {
		const interaction = {
			deferred: true,
			replied: false,
			ephemeral: false,
			user: { id: 'user-1' },
			editReply: vi.fn().mockResolvedValue(undefined),
			followUp: vi.fn().mockResolvedValue(undefined)
		} as unknown as ChatInputCommandInteraction;

		const component = new ContainerBuilder();
		await sendComponent(interaction, component, { ephemeral: false });

		expect(interaction.editReply).toHaveBeenCalledTimes(1);
		expect(interaction.followUp).not.toHaveBeenCalled();
	});
});
