import { emoji } from '@sirubot/utils';
import type { Track } from 'lavalink-client';
import { describe, expect, it } from 'vitest';
import { playStarted, trackAdded } from './play.ts';

const track = {
	info: { title: '노래', author: '가수', duration: 180_000, uri: 'https://example.com/a', artworkUrl: null, identifier: 'a' },
	requester: { id: '123' }
} as unknown as Track;

const text = (component: { toJSON(): unknown }) => JSON.stringify(component.toJSON());

describe('play feedback views', () => {
	const dashboard = { url: 'https://dash.example/servers/1' };

	it('adds a linked dashboard footer to a play start', () => {
		const out = text(playStarted({ track, userId: '123', fromDashboard: dashboard }));
		expect(out).toContain('<@123>님이 재생을 시작했어요!');
		expect(out).toContain('[대시보드](https://dash.example/servers/1)에서 요청했어요');
	});

	it('adds the dashboard footer to a queue add, plain text without a url', () => {
		expect(text(trackAdded({ track, queued: true, position: 2, totalDuration: 0, fromDashboard: dashboard }))).toContain(
			'[대시보드](https://dash.example/servers/1)에서 요청했어요'
		);
		expect(text(trackAdded({ track, queued: false, fromDashboard: { url: null } }))).toContain(`${emoji('dashboard')} 대시보드에서 요청했어요`);
		expect(text(trackAdded({ track, queued: false }))).not.toContain('대시보드');
	});

	it('shows the requester with the user emoji', () => {
		expect(text(trackAdded({ track, queued: false }))).toContain(`가수 ${emoji('user')} <@123>`);
	});
});
