import { createHash } from 'node:crypto';
import { emoji } from '@sirubot/utils';
import { UserError } from '@sapphire/framework';
import type { Player } from 'lavalink-client';
import { getUserQueuedTracks } from '../../lavalink/autoPlayRelated.ts';

function version(player: Player): string {
	return createHash('sha256')
		.update(JSON.stringify(getUserQueuedTracks(player).map((track) => [track.info.identifier, track.info.uri, track.requester])))
		.digest('hex')
		.slice(0, 16);
}

export function queueSelectionValue(player: Player, index: number): string {
	return `${index + 1}.${version(player)}`;
}

export function resolveQueueSelection(player: Player, value: string): number {
	const match = /^(\d+)\.([a-f0-9]{16})$/.exec(value);
	const position = match ? Number(match[1]) : 0;
	if (!match || match[2] !== version(player) || position < 1 || position > getUserQueuedTracks(player).length) {
		throw new UserError({
			identifier: 'queue_selection_changed',
			message: `${emoji('error')} 대기열이 바뀌었거나 선택 시간이 지났어요. /대기열 목록을 새로 열거나 곡 선택지를 다시 골라 주세요. 아무 곡도 변경하지 않았어요.`,
			context: { ephemeral: true }
		});
	}
	return position - 1;
}
