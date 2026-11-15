import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track, TrackInfo } from 'lavalink-client';
import { TrackService, formatRecordError } from './trackService.ts';
import { isTtsClip } from '../lavalink/requester.ts';

const mocks = vi.hoisted(() => ({
	$transaction: vi.fn(),
	trackUpsert: vi.fn(),
	guildUpsert: vi.fn(),
	userUpsert: vi.fn(),
	historyCreate: vi.fn()
}));

const db = {
	$transaction: mocks.$transaction,
	track: { upsert: mocks.trackUpsert },
	guild: { upsert: mocks.guildUpsert },
	user: { upsert: mocks.userUpsert },
	guildTrackHistory: { create: mocks.historyCreate }
} as never;

// $transaction 콜백의 tx는 db와 동일한 모델 계층을 노출한다.
const txShape = {
	track: { upsert: mocks.trackUpsert },
	guild: { upsert: mocks.guildUpsert },
	user: { upsert: mocks.userUpsert },
	guildTrackHistory: { create: mocks.historyCreate }
};
vi.mock('../lavalink/requester.ts', () => ({
	isTtsClip: vi.fn(() => false),
	RELATED_TRACK_REQUESTER_ID: '__related__'
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
	return {
		encoded: 'enc-1',
		info: {
			identifier: 'id-1',
			title: '제목',
			author: '아티스트',
			uri: 'https://youtu.be/id-1',
			duration: 120_000,
			sourceName: 'youtube',
			artworkUrl: null
		},
		requester: { id: 'user-1' },
		...overrides
	} as unknown as Track;
}

describe('TrackService.recordPlay', () => {
	let svc: TrackService;

	beforeEach(() => {
		vi.clearAllMocks();
		// $transaction은 콜백을 받아 즉시 실행하고, tx는 db 모델 계층을 그대로 노출한다.
		mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txShape));
		svc = new TrackService({ db });
	});

	it('곡 upsert·길드/유저 upsert·히스토리 생성을 단일 $transaction 안에서 수행한다', async () => {
		const track = makeTrack();

		await svc.recordPlay('g-1', track);

		expect(mocks.$transaction).toHaveBeenCalledOnce();
		expect(mocks.trackUpsert).toHaveBeenCalledOnce();
		expect(mocks.guildUpsert).toHaveBeenCalledWith({ where: { id: 'g-1' }, create: { id: 'g-1' }, update: {} });
		expect(mocks.userUpsert).toHaveBeenCalledWith({ where: { id: 'user-1' }, create: { id: 'user-1' }, update: {} });
		expect(mocks.historyCreate).toHaveBeenCalledWith({ data: { guildId: 'g-1', trackId: 'id-1', userId: 'user-1' } });

		// 곡 upsert는 totalPlays 증가와 메타 갱신을 포함해야 한다.
		const trackArgs = mocks.trackUpsert.mock.calls[0][0] as { create: { totalPlays: number }; update: { totalPlays: { increment: number } } };
		expect(trackArgs.create.totalPlays).toBe(1);
		expect(trackArgs.update.totalPlays.increment).toBe(1);
	});

	it('식별자도 uri도 없는 곡은 아무것도 기록하지 않는다', async () => {
		const track = makeTrack({ info: { identifier: '', uri: '' } as unknown as TrackInfo });

		await svc.recordPlay('g-1', track);

		expect(mocks.$transaction).not.toHaveBeenCalled();
		expect(mocks.trackUpsert).not.toHaveBeenCalled();
	});

	it('TTS 클립은 기록 대상에서 제외한다', async () => {
		vi.mocked(isTtsClip).mockReturnValueOnce(true);

		await svc.recordPlay('g-1', makeTrack());

		expect(mocks.$transaction).not.toHaveBeenCalled();
	});

	it('연관 추천 요청자(RELATED_TRACK_REQUESTER_ID)는 userId로 기록하지 않는다', async () => {
		const track = makeTrack({ requester: { id: '__related__' } as unknown as Track['requester'] });

		await svc.recordPlay('g-1', track);

		expect(mocks.userUpsert).not.toHaveBeenCalled();
		expect(mocks.historyCreate).toHaveBeenCalledWith({ data: { guildId: 'g-1', trackId: 'id-1', userId: null } });
	});
});

describe('formatRecordError', () => {
	it('Prisma 오류의 code와 meta를 포함한다', () => {
		const err = new Error('Foreign key constraint violated');
		Object.assign(err, { code: 'P2003', meta: { constraint: 'GuildTrackHistory_trackId_fkey' } });

		const text = formatRecordError(err);

		expect(text).toContain('P2003');
		expect(text).toContain('GuildTrackHistory_trackId_fkey');
		expect(text).toContain('Foreign key constraint violated');
	});

	it('일반 Error는 message를 그대로 반환한다', () => {
		expect(formatRecordError(new Error('boom'))).toBe('boom');
	});

	it('Error가 아닌 값은 String으로 변환한다', () => {
		expect(formatRecordError('plain')).toBe('plain');
	});
});
