import { emoji, createContainer } from '@sirubot/utils';

export function lyricsView(trackName: string, artistName: string, lyrics: string) {
	return createContainer().addTextDisplayComponents((text) =>
		text.setContent(`### ${emoji('music_notes')} ${trackName} · ${artistName}\n\n${lyrics}`)
	);
}
