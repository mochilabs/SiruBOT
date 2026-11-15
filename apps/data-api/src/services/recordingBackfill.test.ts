import { describe, expect, it } from 'vitest';
import { type BackfillTrack, planRecordingGroups } from './recordingBackfill.ts';

const track = (over: Partial<BackfillTrack>): BackfillTrack => ({
	id: 'id',
	title: 'Lemon',
	artist: 'Kenshi Yonezu',
	duration: 255_000,
	source: 'youtube',
	thumbnail: null,
	isrc: null,
	totalPlays: 1,
	...over
});

describe('planRecordingGroups', () => {
	it('groups MV, Topic and catalog uploads of the same song', () => {
		const { groups } = planRecordingGroups(
			[
				track({ id: 'mv', title: 'Lemon (Official MV)', duration: 256_500 }),
				track({ id: 'topic', artist: 'Kenshi Yonezu - Topic', duration: 255_000 }),
				track({ id: 'sp', source: 'spotify', isrc: 'JPU901800227', duration: 255_800, totalPlays: 5 })
			],
			[]
		);
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({ isrc: 'JPU901800227', recordingId: null });
		expect(groups[0]!.tracks.map((t) => t.id)).toEqual(['sp', 'mv', 'topic']);
	});

	it('keeps a long MV cut and a remix apart', () => {
		const { groups } = planRecordingGroups(
			[
				track({ id: 'song' }),
				track({ id: 'long-mv', title: 'Lemon (Official MV)', duration: 275_000 }),
				track({ id: 'remix', title: 'Lemon (Remix)' })
			],
			[]
		);
		expect(groups).toHaveLength(3);
	});

	it('joins an existing recording created by the bot', () => {
		const { groups } = planRecordingGroups(
			[track({ id: 'old' })],
			[{ id: 'rec-1', key: 'rec:kenshi yonezu|lemon', isrc: null, duration: 254_000 }]
		);
		expect(groups).toEqual([expect.objectContaining({ recordingId: 'rec-1', tracks: [expect.objectContaining({ id: 'old' })] })]);
	});

	it('does not join a group whose ISRC differs', () => {
		const { groups } = planRecordingGroups(
			[track({ id: 'a', isrc: 'JPU901800227', source: 'spotify' }), track({ id: 'b', isrc: 'JPU901899999', source: 'spotify' })],
			[]
		);
		expect(groups).toHaveLength(2);
	});

	it('skips tracks with no artist, title or ISRC', () => {
		const { groups, skipped } = planRecordingGroups([track({ id: 'x', title: '', artist: '' })], []);
		expect(groups).toHaveLength(0);
		expect(skipped).toHaveLength(1);
	});
});
