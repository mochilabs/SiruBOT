import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track, TrackInfo } from 'lavalink-client';
import { TrackService, formatRecordError } from './trackService.ts';
import { isTtsClip } from '../lavalink/requester.ts';

const mocks = vi.hoisted(() => ({
	$transaction: vi.fn(),
	trackUpsert: vi.fn(),
	guildUpsert: vi.fn(),
	userUpsert: vi.fn(),
	historyCreate: vi.fn(),
	trackUpdate: vi.fn(),
	queryRaw: vi.fn(),
	recordingFindUnique: vi.fn(),
	recordingFindMany: vi.fn(),
	recordingCreate: vi.fn(),
	recordingUpdate: vi.fn(),
	dailyUpsert: vi.fn()
}));

const db = {
	$transaction: mocks.$transaction,
	track: { upsert: mocks.trackUpsert },
	guild: { upsert: mocks.guildUpsert },
	user: { upsert: mocks.userUpsert },
	guildTrackHistory: { create: mocks.historyCreate }
} as never;

const txShape = {
	$queryRaw: mocks.queryRaw,
	track: { upsert: mocks.trackUpsert, update: mocks.trackUpdate },
	recording: {
		findUnique: mocks.recordingFindUnique,
		findMany: mocks.recordingFindMany,
		create: mocks.recordingCreate,
		update: mocks.recordingUpdate
	},
	recordingDailyPlay: { upsert: mocks.dailyUpsert },
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
		mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txShape));
		mocks.trackUpsert.mockResolvedValue({ recordingId: null });
		mocks.recordingFindUnique.mockResolvedValue(null);
		mocks.recordingFindMany.mockResolvedValue([]);
		mocks.recordingCreate.mockResolvedValue({ id: 'rec-new', isrc: null });
		mocks.recordingUpdate.mockResolvedValue({ source: 'youtube' });
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

describe('TrackService.recordPlay — 곡 묶음과 차트 롤업', () => {
	let svc: TrackService;

	beforeEach(() => {
		vi.clearAllMocks();
		mocks.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(txShape));
		mocks.trackUpsert.mockResolvedValue({ recordingId: null });
		mocks.recordingFindUnique.mockResolvedValue(null);
		mocks.recordingFindMany.mockResolvedValue([]);
		mocks.recordingCreate.mockResolvedValue({ id: 'rec-new', isrc: null });
		mocks.recordingUpdate.mockResolvedValue({ source: 'youtube' });
		svc = new TrackService({ db });
	});

	it('첫 재생이면 새 묶음을 만들고 연결한 뒤 일별 롤업을 올린다', async () => {
		await svc.recordPlay('g-1', makeTrack({ info: { ...makeTrack().info, title: 'Lemon (Official MV)', author: 'Kenshi Yonezu - Topic' } }));

		expect(mocks.recordingCreate).toHaveBeenCalledWith(
			expect.objectContaining({ data: expect.objectContaining({ key: 'rec:kenshi yonezu|lemon', title: 'Lemon', artist: 'Kenshi Yonezu' }) })
		);
		expect(mocks.trackUpdate).toHaveBeenCalledWith({ where: { id: 'id-1' }, data: { recordingId: 'rec-new' } });
		expect(mocks.dailyUpsert).toHaveBeenCalledWith(
			expect.objectContaining({
				create: expect.objectContaining({ recordingId: 'rec-new', guildId: 'g-1', plays: 1 }),
				update: { plays: { increment: 1 } }
			})
		);
	});

	it('이미 묶인 곡은 다시 묶지 않고 증가만 한다', async () => {
		mocks.trackUpsert.mockResolvedValue({ recordingId: 'rec-1' });

		await svc.recordPlay('g-1', makeTrack());

		expect(mocks.queryRaw).not.toHaveBeenCalled();
		expect(mocks.recordingCreate).not.toHaveBeenCalled();
		expect(mocks.recordingUpdate).toHaveBeenCalledWith(
			expect.objectContaining({ where: { id: 'rec-1' }, data: { totalPlays: { increment: 1 } } })
		);
	});

	it('같은 키의 묶음 중 길이 ±3초 이내에 붙고, 묶음의 ISRC를 물려받는다', async () => {
		mocks.recordingFindMany.mockResolvedValue([
			{ id: 'rec-mv', isrc: null, duration: 140_000 },
			{ id: 'rec-song', isrc: 'JPU901800227', duration: 121_500 }
		]);

		await svc.recordPlay('g-1', makeTrack());

		expect(mocks.recordingCreate).not.toHaveBeenCalled();
		expect(mocks.trackUpdate).toHaveBeenCalledWith({
			where: { id: 'id-1' },
			data: expect.objectContaining({ recordingId: 'rec-song', isrc: 'JPU901800227', isrcSource: 'recording' })
		});
	});

	it('ISRC가 있으면 ISRC 묶음을 먼저 찾는다', async () => {
		mocks.recordingFindUnique.mockResolvedValue({ id: 'rec-isrc', isrc: 'JPU901800227' });

		await svc.recordPlay('g-1', makeTrack({ info: { ...makeTrack().info, isrc: 'JP-U90-18-00227', sourceName: 'spotify' } }));

		expect(mocks.recordingFindUnique).toHaveBeenCalledWith({ where: { isrc: 'JPU901800227' }, select: { id: true, isrc: true } });
		expect(mocks.trackUpdate).toHaveBeenCalledWith({ where: { id: 'id-1' }, data: { recordingId: 'rec-isrc' } });
		const upsertArgs = mocks.trackUpsert.mock.calls[0]![0] as { create: Record<string, unknown> };
		expect(upsertArgs.create).toMatchObject({ isrc: 'JPU901800227', isrcSource: 'lavalink' });
	});

	it('더 정식인 소스가 들어오면 대표 표시값을 바꾼다', async () => {
		mocks.trackUpsert.mockResolvedValue({ recordingId: 'rec-1' });

		await svc.recordPlay(
			'g-1',
			makeTrack({ info: { ...makeTrack().info, title: 'Lemon', author: 'Kenshi Yonezu', sourceName: 'spotify', artworkUrl: 'art' } })
		);

		expect(mocks.recordingUpdate).toHaveBeenLastCalledWith({
			where: { id: 'rec-1' },
			data: { title: 'Lemon', artist: 'Kenshi Yonezu', source: 'spotify', thumbnail: 'art' }
		});
	});

	it('자동재생 추천곡은 누적에는 넣고 일별 롤업에는 넣지 않는다', async () => {
		mocks.trackUpsert.mockResolvedValue({ recordingId: 'rec-1' });

		await svc.recordPlay('g-1', makeTrack({ requester: { id: '__related__' } as unknown as Track['requester'] }));

		expect(mocks.recordingUpdate).toHaveBeenCalled();
		expect(mocks.dailyUpsert).not.toHaveBeenCalled();
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
