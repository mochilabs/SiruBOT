import { describe, expect, it } from 'vitest';
import { playlistLibraryView } from './playlist.ts';

const playlists = Array.from({ length: 12 }, (_, index) => ({
	id: `p${index}`,
	name: `목록 ${index}`,
	description: '즐겨 듣는 노래',
	_count: { tracks: 30 }
}));
const entries = Array.from({ length: 30 }, (_, index) => ({ id: `entry${index}`, track: { title: `곡 ${index}`, artist: '가수' } }));
type Lists = Parameters<typeof playlistLibraryView>[2];
type Detail = Parameters<typeof playlistLibraryView>[3];

describe('플레이리스트 Components V2 보관함', () => {
	it('홈은 5개씩 표시하고 안정적인 ID로 목록을 선택해요', () => {
		const json = playlistLibraryView('library:test', { kind: 'list', page: 1 }, playlists as Lists, null).toJSON();
		expect(json.type).toBe(17);
		const serialized = JSON.stringify(json);
		expect(serialized).toContain('p5');
		expect(serialized).not.toContain('p10');
		expect(serialized).toContain('새 플레이리스트');
	});
	it('뒤쪽 곡도 페이지로 접근하고 삭제 선택에는 DB 항목 ID를 써요', () => {
		const detail = { playlist: playlists[0], tracks: entries } as unknown as Detail;
		const json = JSON.stringify(
			playlistLibraryView('library:test', { kind: 'tracks', playlistId: 'p0', page: 5 }, playlists as Lists, detail).toJSON()
		);
		expect(json).toContain('entry25');
		expect(json).toContain('entry29');
		expect(json).not.toContain('entry24');
	});
	it('확인 화면은 선택한 제목과 삭제 범위를 보여줘요', () => {
		const detail = { playlist: playlists[0], tracks: entries } as unknown as Detail;
		const json = JSON.stringify(
			playlistLibraryView('library:test', { kind: 'remove', playlistId: 'p0', page: 0, entryId: 'entry2' }, playlists as Lists, detail).toJSON()
		);
		expect(json).toContain('곡 2');
		expect(json).toContain('현재 재생과 서버 대기열은 바뀌지 않아요');
		expect(json).toContain('돌아가기');
	});
});
