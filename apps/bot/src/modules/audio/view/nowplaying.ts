import { createContainer } from '@sirubot/utils';
import { SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { buildFooterSegments, buildTrackDisplay } from './controller.ts';

type NowPlayingViewProps = {
	player: Player;
	track: Track;
};

export function nowplaying({ player, track }: NowPlayingViewProps) {
	const containerComponent = createContainer();

	const nowplayingTextDisplay = new TextDisplayBuilder().setContent(buildTrackDisplay(player, track).join('\n'));

	if (track.info.artworkUrl) {
		const titleSection = new SectionBuilder().addTextDisplayComponents(nowplayingTextDisplay);
		const thumbnail = new ThumbnailBuilder().setURL(track.info.artworkUrl);
		titleSection.setThumbnailAccessory(thumbnail);
		containerComponent.addSectionComponents(titleSection);
	} else {
		containerComponent.addTextDisplayComponents(nowplayingTextDisplay);
	}

	const separatorSmall = new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small);

	containerComponent
		.addSeparatorComponents(separatorSmall)
		.addTextDisplayComponents(new TextDisplayBuilder().setContent(buildFooterSegments(player).join(' | ')));

	return containerComponent;
}

export function nowplayingEmpty() {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent('🔇 현재 재생 중인 곡이 없어요.'));
}
