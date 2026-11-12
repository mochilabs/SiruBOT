import { describe, expect, it, vi } from 'vitest';
import type { Player } from 'lavalink-client';
import { queueSelectionValue, resolveQueueSelection } from './queueSelection.ts';

vi.mock('../../../features/music/lavalink/autoPlayRelated.ts', () => ({
	getUserQueuedTracks: (player: { queue: { tracks: unknown[] } }) => player.queue.tracks
}));

describe('곡 선택 후 대기열 변경', () => {
	const track = (id: string) => ({ info: { identifier: id, uri: `https://music/${id}` }, requester: { id: 'user' } });
	it('선택한 곡을 돌려줘요', () => {
		const player = { queue: { tracks: [track('a'), track('b')] } } as unknown as Player;
		expect(resolveQueueSelection(player, queueSelectionValue(player, 1))).toBe(1);
	});
	it('앞 곡이 삭제되면 다른 곡으로 바꿔 실행하지 않아요', () => {
		const player = { queue: { tracks: [track('a'), track('b'), track('c')] } } as unknown as Player;
		const choice = queueSelectionValue(player, 1);
		player.queue.tracks.shift();
		expect(() => resolveQueueSelection(player, choice)).toThrow('대기열이 바뀌었');
	});
	it('다른 사람이 셔플한 목록과 예전 버튼은 거절해요', () => {
		const player = { queue: { tracks: [track('a'), track('b')] } } as unknown as Player;
		const choice = queueSelectionValue(player, 0);
		player.queue.tracks.reverse();
		expect(() => resolveQueueSelection(player, choice)).toThrow();
		expect(() => resolveQueueSelection(player, '1')).toThrow();
	});
});
