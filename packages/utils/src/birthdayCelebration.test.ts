import { describe, expect, it } from 'vitest';
import {
	BIRTHDAY_SETTINGS_DEFAULTS,
	birthdayDatesFor,
	birthdaySettingsInputSchema,
	DEFAULT_BIRTHDAY_CARD,
	DEFAULT_CARD_CONFIGS,
	firstActiveDate,
	formatBirthdayNames,
	isBirthdayToday,
	isLeapYear,
	kstDateOf,
	kstDateString,
	nextActiveFrom,
	nextDailyRun,
	nextSendAt,
	parseSendTime,
	sendAtOnKstDate,
	shouldCelebrate
} from './birthdayCelebration.ts';
import { validateGreetingConfig } from './memberGreeting.ts';

const kst = (text: string) => new Date(`${text.replace(' ', 'T')}:00+09:00`);

describe('KST 날짜', () => {
	it('UTC 자정 직전·직후가 KST 날짜를 넘겨요', () => {
		expect(kstDateString(new Date('2026-11-21T14:59:59Z'))).toBe('2026-11-21');
		expect(kstDateString(new Date('2026-11-21T15:00:00Z'))).toBe('2026-11-22');
		expect(kstDateOf(new Date('2026-12-31T15:00:00Z'))).toEqual({ year: 2027, month: 1, day: 1 });
	});

	it('윤년 판정', () => {
		expect([2024, 2028, 2000].every(isLeapYear)).toBe(true);
		expect([2026, 2027, 1900, 2100].some(isLeapYear)).toBe(false);
	});
});

describe('2월 29일생', () => {
	it('평년의 2월 28일에는 2/28생과 2/29생을 함께 축하해요', () => {
		expect(birthdayDatesFor({ year: 2027, month: 2, day: 28 })).toEqual([
			{ month: 2, day: 28 },
			{ month: 2, day: 29 }
		]);
		expect(isBirthdayToday(2, 29, { year: 2027, month: 2, day: 28 })).toBe(true);
		expect(isBirthdayToday(2, 28, { year: 2027, month: 2, day: 28 })).toBe(true);
	});

	it('윤년에는 2/29에 2/29생만, 2/28에는 2/28생만 축하해요', () => {
		expect(birthdayDatesFor({ year: 2028, month: 2, day: 28 })).toEqual([{ month: 2, day: 28 }]);
		expect(isBirthdayToday(2, 29, { year: 2028, month: 2, day: 28 })).toBe(false);
		expect(isBirthdayToday(2, 29, { year: 2028, month: 2, day: 29 })).toBe(true);
		expect(isBirthdayToday(2, 28, { year: 2028, month: 2, day: 29 })).toBe(false);
	});

	it('평년의 3월 1일에는 2/29생을 축하하지 않아요 (2/28로 당겼으니까요)', () => {
		expect(isBirthdayToday(2, 29, { year: 2027, month: 3, day: 1 })).toBe(false);
	});

	it('일반 날짜는 그날에만 맞아요', () => {
		expect(isBirthdayToday(5, 10, { year: 2026, month: 5, day: 10 })).toBe(true);
		expect(isBirthdayToday(5, 10, { year: 2026, month: 5, day: 11 })).toBe(false);
	});
});

describe('보내는 시각', () => {
	it('HH:mm을 분으로 해석하고 잘못된 형식은 null이에요', () => {
		expect(parseSendTime('09:00')).toBe(540);
		expect(parseSendTime('23:59')).toBe(1439);
		for (const bad of ['9:00', '24:00', '09:60', '0900', '']) expect(parseSendTime(bad)).toBeNull();
	});

	it('KST 09:00은 UTC 00:00이에요', () => {
		expect(sendAtOnKstDate({ year: 2026, month: 11, day: 22 }, '09:00').toISOString()).toBe('2026-11-22T00:00:00.000Z');
		expect(sendAtOnKstDate({ year: 2026, month: 11, day: 22 }, '00:30').toISOString()).toBe('2026-11-21T15:30:00.000Z');
	});

	it('nextSendAt은 오늘 시각 전이면 오늘, 지났거나 같으면 내일이에요', () => {
		expect(nextSendAt(kst('2026-11-22 08:59'), '09:00')).toEqual(kst('2026-11-22 09:00'));
		expect(nextSendAt(kst('2026-11-22 09:00'), '09:00')).toEqual(kst('2026-11-23 09:00'));
		expect(nextSendAt(kst('2026-11-22 23:59'), '09:00')).toEqual(kst('2026-11-23 09:00'));
	});

	it('KST 자정 부근 UTC 날짜가 달라도 KST 기준으로 계산해요', () => {
		expect(nextSendAt(new Date('2026-11-21T16:00:00Z'), '09:00')).toEqual(kst('2026-11-22 09:00'));
	});

	it('nextDailyRun은 하루 뒤 같은 시각이고, 오래 밀렸으면 지금 이후로 건너뛰어요', () => {
		expect(nextDailyRun(kst('2026-11-22 09:00'), kst('2026-11-22 09:00'), '09:00')).toEqual(kst('2026-11-23 09:00'));
		expect(nextDailyRun(kst('2026-11-22 09:00'), kst('2026-11-25 10:00'), '09:00')).toEqual(kst('2026-11-26 09:00'));
	});

	it('보내는 시각을 바꿔도 다음 회차는 새 시각을 따라요', () => {
		expect(nextDailyRun(kst('2026-11-22 09:00'), kst('2026-11-22 09:00'), '21:30')).toEqual(kst('2026-11-23 21:30'));
	});
});

describe('켜는 날과 중복 방지', () => {
	it('firstActiveDate는 KST 기준 다음 날이에요', () => {
		expect(firstActiveDate(kst('2026-11-22 23:50'))).toBe('2026-11-23');
		expect(firstActiveDate(new Date('2026-11-21T15:10:00Z'))).toBe('2026-11-23');
		expect(firstActiveDate(kst('2027-02-28 10:00'))).toBe('2027-03-01');
	});

	it('켠 당일에는 쉬고 다음 날부터 보내요', () => {
		const base = { activeFrom: '2026-11-23', lastCelebratedOn: null };
		expect(shouldCelebrate({ ...base, today: '2026-11-22' })).toBe(false);
		expect(shouldCelebrate({ ...base, today: '2026-11-23' })).toBe(true);
		expect(shouldCelebrate({ ...base, today: '2026-11-24' })).toBe(true);
	});

	it('같은 날 두 번 보내지 않아요', () => {
		expect(shouldCelebrate({ today: '2026-11-23', activeFrom: null, lastCelebratedOn: '2026-11-23' })).toBe(false);
		expect(shouldCelebrate({ today: '2026-11-24', activeFrom: null, lastCelebratedOn: '2026-11-23' })).toBe(true);
	});

	it('nextActiveFrom: 처음 켜면 다음 날, 이미 켜져 있으면 유지, 끄면 비워요', () => {
		const now = kst('2026-11-22 12:00');
		expect(nextActiveFrom({ enabled: false, activeFrom: null }, true, now)).toBe('2026-11-23');
		expect(nextActiveFrom({ enabled: true, activeFrom: '2026-11-01' }, true, now)).toBe('2026-11-01');
		expect(nextActiveFrom({ enabled: true, activeFrom: '2026-11-01' }, false, now)).toBeNull();
		expect(nextActiveFrom({ enabled: false, activeFrom: null }, true, kst('2026-12-01 08:00'))).toBe('2026-12-02');
	});
});

describe('여러 명의 이름', () => {
	it('3명까지는 쉼표로, 더 많으면 외 N명으로 줄여요', () => {
		expect(formatBirthdayNames(['가'])).toBe('가');
		expect(formatBirthdayNames(['가', '나', '다'])).toBe('가, 나, 다');
		expect(formatBirthdayNames(['가', '나', '다', '라', '마'])).toBe('가, 나, 다 외 2명');
	});

	it('64자를 넘지 않아요', () => {
		expect(formatBirthdayNames(['가'.repeat(40), '나'.repeat(40)]).length).toBeLessThanOrEqual(64);
	});
});

describe('설정 계약', () => {
	it('기본 카드는 인사 카드 스키마를 통과하고 생일 프리셋 배경을 써요', () => {
		expect(validateGreetingConfig(DEFAULT_BIRTHDAY_CARD)).not.toBeNull();
		expect(DEFAULT_BIRTHDAY_CARD.image?.background.presetId).toBe('birthday');
		expect(DEFAULT_BIRTHDAY_CARD.enabled).toBe(false);
		expect(DEFAULT_CARD_CONFIGS.birthday).toBe(DEFAULT_BIRTHDAY_CARD);
	});

	it('입력 스키마는 시각 형식과 역할 ID를 확인해요', () => {
		const ok = { card: DEFAULT_BIRTHDAY_CARD, sendTime: '09:00', roleId: null };
		expect(birthdaySettingsInputSchema.safeParse(ok).success).toBe(true);
		expect(birthdaySettingsInputSchema.safeParse({ ...ok, sendTime: '9시' }).success).toBe(false);
		expect(birthdaySettingsInputSchema.safeParse({ ...ok, roleId: 'abc' }).success).toBe(false);
		expect(birthdaySettingsInputSchema.safeParse({ ...ok, roleId: '123456789012345678' }).success).toBe(true);
		expect(BIRTHDAY_SETTINGS_DEFAULTS.sendTime).toBe('09:00');
	});
});
