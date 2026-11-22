import { describe, expect, it } from 'vitest';
import {
	buildRecurrence,
	checkNewScheduledMessage,
	createScheduledMessageSchema,
	formatKstDateTime,
	parseKstDateTime,
	parseScheduledMessagePayload,
	SCHEDULED_MESSAGE_CONTENT_MAX,
	SCHEDULED_MESSAGE_SETTINGS_DEFAULTS,
	scheduledMessageContentSchema,
	scheduledMessageSettingsSchema,
	type ActiveScheduledMessage
} from './scheduledMessage.js';

const kst = (text: string) => new Date(`${text}+09:00`);
const NOW = kst('2026-12-01T00:00:00');
const CH = '123456789012345678';
const SERIES = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const existing = (over: Partial<ActiveScheduledMessage> = {}): ActiveScheduledMessage => ({
	seriesId: SERIES,
	channelId: CH,
	runAt: kst('2026-12-25T09:00:00'),
	...over
});
const check = (over: Partial<Parameters<typeof checkNewScheduledMessage>[0]> = {}) =>
	checkNewScheduledMessage({
		now: NOW,
		runAt: kst('2026-12-25T12:00:00'),
		channelId: CH,
		existing: [],
		settings: SCHEDULED_MESSAGE_SETTINGS_DEFAULTS,
		...over
	});

describe('본문 검증', () => {
	it('앞뒤 공백을 다듬고 빈 본문과 2000자 초과를 거부해요', () => {
		expect(scheduledMessageContentSchema.parse('  안녕  ')).toBe('안녕');
		expect(scheduledMessageContentSchema.safeParse('   ').success).toBe(false);
		expect(scheduledMessageContentSchema.safeParse('가'.repeat(SCHEDULED_MESSAGE_CONTENT_MAX)).success).toBe(true);
		expect(scheduledMessageContentSchema.safeParse('가'.repeat(SCHEDULED_MESSAGE_CONTENT_MAX + 1)).success).toBe(false);
	});

	it('@everyone/@here는 대소문자와 상관없이 거부해요', () => {
		expect(scheduledMessageContentSchema.safeParse('공지 @everyone 모여요').success).toBe(false);
		expect(scheduledMessageContentSchema.safeParse('@HERE').success).toBe(false);
		expect(scheduledMessageContentSchema.safeParse('<@123456789012345678> 안녕').success).toBe(true);
	});

	it('대시보드 만들기 본문은 일시 형식과 반복 값을 확인해요', () => {
		const ok = { channelId: CH, content: '안녕', runAt: '2026-12-25 09:00', repeat: 'daily' };
		expect(createScheduledMessageSchema.safeParse(ok).success).toBe(true);
		expect(createScheduledMessageSchema.safeParse({ ...ok, runAt: '2026-02-30 09:00' }).success).toBe(false);
		expect(createScheduledMessageSchema.safeParse({ ...ok, repeat: 'hourly' }).success).toBe(false);
	});
});

describe('시각', () => {
	it('KST 문자열을 UTC Date로 바꾸고 되돌려요', () => {
		const date = parseKstDateTime('2026-12-25 09:00');
		expect(date?.toISOString()).toBe('2026-12-25T00:00:00.000Z');
		expect(formatKstDateTime(date!)).toBe('2026-12-25 09:00');
		expect(parseKstDateTime('2026-12-25T09:00')?.getTime()).toBe(date?.getTime());
	});

	it('없는 날짜와 잘못된 형식은 null이에요', () => {
		expect(parseKstDateTime('2026-02-30 09:00')).toBeNull();
		expect(parseKstDateTime('2026-12-25 24:00')).toBeNull();
		expect(parseKstDateTime('12/25 9시')).toBeNull();
	});

	it('첫 실행 시각에서 반복 규칙을 만들어요', () => {
		const first = kst('2026-12-25T09:30:00'); // 금요일
		expect(buildRecurrence('none', first)).toBeUndefined();
		expect(buildRecurrence('daily', first)).toEqual({ type: 'daily', time: '09:30' });
		expect(buildRecurrence('weekly', first)).toEqual({ type: 'weekly', weekday: 5, time: '09:30' });
		expect(buildRecurrence('monthly', first)).toEqual({ type: 'monthly', day: 25, time: '09:30' });
	});
});

describe('payload·설정', () => {
	it('저장된 payload를 읽고 깨진 값은 null이에요', () => {
		const payload = { seriesId: SERIES, channelId: CH, content: '안녕', recurrence: { type: 'daily', time: '09:00' } };
		expect(parseScheduledMessagePayload(payload)).toEqual(payload);
		expect(parseScheduledMessagePayload({ ...payload, channelId: 'x' })).toBeNull();
		expect(parseScheduledMessagePayload({ ...payload, content: '@everyone' })).toBeNull();
		expect(parseScheduledMessagePayload(null)).toBeNull();
	});

	it('기본값은 활성 25개, 간격 10분이고 서버 설정 범위를 지켜요', () => {
		expect(SCHEDULED_MESSAGE_SETTINGS_DEFAULTS).toEqual({ maxActive: 25, minIntervalMinutes: 10 });
		expect(scheduledMessageSettingsSchema.safeParse({ maxActive: 0, minIntervalMinutes: 10 }).success).toBe(false);
		expect(scheduledMessageSettingsSchema.safeParse({ maxActive: 101, minIntervalMinutes: 10 }).success).toBe(false);
		expect(scheduledMessageSettingsSchema.safeParse({ maxActive: 25, minIntervalMinutes: 1441 }).success).toBe(false);
		expect(scheduledMessageSettingsSchema.safeParse({ maxActive: 50, minIntervalMinutes: 30 }).success).toBe(true);
	});
});

describe('checkNewScheduledMessage', () => {
	it('1분 안의 과거·근미래와 1년 넘게 먼 시각은 거부해요', () => {
		expect(check({ runAt: kst('2026-11-30T00:00:00') })).toMatchObject({ ok: false, code: 'past' });
		expect(check({ runAt: new Date(NOW.getTime() + 30_000) })).toMatchObject({ ok: false, code: 'past' });
		expect(check({ runAt: kst('2028-01-01T00:00:00') })).toMatchObject({ ok: false, code: 'too-far' });
		expect(check()).toEqual({ ok: true });
	});

	it('활성 예약이 상한이면 거부하고, 같은 예약의 여러 행은 한 건으로 세요', () => {
		const full = Array.from({ length: 25 }, (_, i) =>
			existing({ seriesId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, channelId: `${i}00000000000000000` })
		);
		expect(check({ existing: full })).toMatchObject({ ok: false, code: 'limit' });
		expect(check({ existing: full.slice(1) })).toEqual({ ok: true });
		const sameSeries = [
			existing({ channelId: '999999999999999999' }),
			existing({ channelId: '999999999999999999', runAt: kst('2026-12-26T09:00:00') })
		];
		expect(check({ existing: sameSeries, settings: { maxActive: 2, minIntervalMinutes: 10 } })).toEqual({ ok: true });
		expect(check({ existing: sameSeries, settings: { maxActive: 1, minIntervalMinutes: 10 } })).toMatchObject({ code: 'limit' });
	});

	it('같은 채널에서 10분 안쪽이면 거부하고, 정확히 10분이거나 다른 채널이면 통과해요', () => {
		expect(check({ runAt: kst('2026-12-25T09:09:00'), existing: [existing()] })).toMatchObject({ ok: false, code: 'interval' });
		expect(check({ runAt: kst('2026-12-25T08:51:00'), existing: [existing()] })).toMatchObject({ ok: false, code: 'interval' });
		expect(check({ runAt: kst('2026-12-25T09:10:00'), existing: [existing()] })).toEqual({ ok: true });
		expect(check({ runAt: kst('2026-12-25T09:05:00'), channelId: '223456789012345678', existing: [existing()] })).toEqual({ ok: true });
	});

	it('서버가 간격을 바꾸면 그 값을 따라요', () => {
		const settings = { maxActive: 25, minIntervalMinutes: 60 };
		expect(check({ runAt: kst('2026-12-25T09:40:00'), existing: [existing()], settings })).toMatchObject({ code: 'interval' });
		expect(check({ runAt: kst('2026-12-25T10:00:00'), existing: [existing()], settings })).toEqual({ ok: true });
	});

	it('반복 예약은 이후 회차끼리의 충돌도 찾아요', () => {
		// 기존: 매일 09:00. 새 것: 12-27 09:05 한 번 → 첫 회차는 달라도 12-27 09:00 회차와 5분 차이
		const daily = existing({ recurrence: { type: 'daily', time: '09:00' }, runAt: kst('2026-12-25T09:00:00') });
		expect(check({ runAt: kst('2026-12-27T09:05:00'), existing: [daily] })).toMatchObject({ code: 'interval' });
		// 새 반복이 기존 한 번짜리와 며칠 뒤에 겹치는 경우
		const once = existing({ runAt: kst('2026-12-28T09:00:00') });
		expect(check({ runAt: kst('2026-12-25T09:05:00'), recurrence: { type: 'daily', time: '09:05' }, existing: [once] })).toMatchObject({
			code: 'interval'
		});
		expect(check({ runAt: kst('2026-12-25T10:00:00'), recurrence: { type: 'daily', time: '10:00' }, existing: [daily] })).toEqual({ ok: true });
	});
});
