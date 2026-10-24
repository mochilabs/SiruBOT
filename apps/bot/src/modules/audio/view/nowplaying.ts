import { emoji, createContainer } from '@sirubot/utils';
import { SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { buildFooterSegments, buildTrackDisplay } from './controller.ts';

type NowPlayingViewProps = {
	player: Player;
	track: Track;
};

export function nowplaying({ player, track }: NowPlayingViewProps) {
	const containerComponent = createContainer();

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(buildTrackDisplay(player, track, { progressEmoji: true }).join('\n'));

	if (track.info.artworkUrl) {
		const titleSection = new SectionBuilder().addTextDisplayComponents(nowplayingTextDisplay);
		const thumbnail = new ThumbnailBuilder().setURL(track.info.artworkUrl);
		titleSection.setThumbnailAccessory(thumbnail);
		containerComponent.addSectionComponents(titleSection);
	} else {
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	}

	// Queue details stay visually separated; the idle footer does not.
	if (player.queue.tracks.length > 0) {
		containerComponent.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
	}
	containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${buildFooterSegments(player).join(' ')}`));

	return containerComponent;
}

export function nowplayingEmpty() {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(`${emoji('volume_muted')} 현재 재생 중인 곡이 없어요.`));
}
