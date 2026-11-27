import type { AttachmentBuilder, ContainerBuilder, Message } from 'discord.js';
import { getDisplayNowPlayingCard, type NowPlayingCardAttachment } from './nowPlayingCard.ts';
import { controllerView } from '../../discord/views/controller.ts';
import type { CustomPlayer } from './customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import { nowPlayingTrack } from './nowPlaying.ts';
import { withGuildTheme } from '../../../../lib/guildTheme.ts';
import * as guildChannels from '../../../../services/guildSettings/channels.ts';

export interface ControllerCardPayloadOptions {
	volume: number;
	textChannelId: string | null | undefined;
	message?: Message | null;
	previousTrackKey?: string;
}

export interface ControllerCardPayload {
	pinned: boolean;
	card: NowPlayingCardAttachment | null;
	components: ContainerBuilder;
	attachments: { id: string }[];
	files: AttachmentBuilder[];
}

export async function buildControllerCardPayload(
	deps: LavalinkDeps,
	player: CustomPlayer,
	options: ControllerCardPayloadOptions
): Promise<ControllerCardPayload> {
	const panelChannelId = await guildChannels.getPanelChannel(deps.guildService, player.guildId).catch(() => null);
	const pinned = Boolean(options.textChannelId) && options.textChannelId === panelChannelId;
	const card = pinned ? getDisplayNowPlayingCard(deps, player) : null;

	const currentIdentifier = nowPlayingTrack(player)?.info.identifier;
	const currentNode = player.node;
	const components = await withGuildTheme(
		player.guildId,
		async (guildId) => (await deps.guildService.getGuild(guildId)).themePreset,
		() =>
			controllerView({
				player,
				volume: options.volume,
				nowPlayingCardUrl: card?.url,
				panel: pinned,
				currentBpm: deps.currentBpm.read(
					player,
					currentNode,
					currentIdentifier,
					(signal) => deps.mixerService.getState(player, signal),
					() => {
						if (player.node === currentNode && nowPlayingTrack(player)?.info.identifier === currentIdentifier) {
							deps.playerNotifier.updateController(player);
						}
					}
				)
			}),
		{ fresh: true }
	);

	const cardNeedsUpload = card !== null && options.previousTrackKey !== undefined && options.previousTrackKey !== card.trackKey;
	const attachments =
		card && !cardNeedsUpload && options.message
			? options.message.attachments.filter((file) => file.name === card.filename).map((file) => ({ id: file.id }))
			: [];
	const files = card && (cardNeedsUpload || !options.message?.attachments.some((file) => file.name === card.filename)) ? [card.file] : [];

	return { pinned, card, components, attachments, files };
}
