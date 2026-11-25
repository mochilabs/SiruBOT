import { z } from 'zod';
import { DEFAULT_GREETINGS, GREETING_TEMPLATES, greetingConfigSchema, type GreetingConfig, type GreetingKind } from './memberGreeting.js';

// Birthdays are month/day only (`User.birthMonth`/`birthDay`); year and age are never stored.
// Only members who opted in per server (`BirthdayOptIn`) are celebrated.
// The card reuses `GreetingConfig` so the greeting renderer and editor work unchanged.
// A `ScheduledJob` (kind `birthday_daily`) runs once a day per server; all dates and times are Asia/Seoul (fixed UTC+9).

export const BIRTHDAY_DAILY_KIND = 'birthday_daily';
export const BIRTHDAY_DEFAULT_SEND_TIME = '09:00';
/** Beyond this, names collapse to "외 N명". */
export const BIRTHDAY_NAMES_SHOWN = 3;
const DISPLAY_NAME_MAX = 64;

export type GreetingCardKind = GreetingKind | 'birthday';

const KST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface KstDate {
	year: number;
	month: number;
	day: number;
}

export function kstDateOf(date: Date): KstDate {
	const kst = new Date(date.getTime() + KST_OFFSET_MS);
	return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

/** KST date; string comparison is date order. */
export function kstDateString(date: Date): string {
	const { year, month, day } = kstDateOf(date);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${year}-${p(month)}-${p(day)}`;
}

export function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Feb 29 birthdays are celebrated on Feb 28 in non-leap years, so that day also returns 2/29. */
export function birthdayDatesFor(today: KstDate): { month: number; day: number }[] {
	const dates = [{ month: today.month, day: today.day }];
	if (today.month === 2 && today.day === 28 && !isLeapYear(today.year)) dates.push({ month: 2, day: 29 });
	return dates;
}

export function isBirthdayToday(month: number, day: number, today: KstDate): boolean {
	return birthdayDatesFor(today).some((date) => date.month === month && date.day === day);
}

const SEND_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const sendTimeSchema = z.string().regex(SEND_TIME_PATTERN, '시각은 09:00처럼 적어 주세요.');

/** Minutes after midnight; null for a malformed value. */
export function parseSendTime(time: string): number | null {
	const match = SEND_TIME_PATTERN.exec(time);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function sendAtOnKstDate(date: KstDate, sendTime: string): Date {
	const minutes = parseSendTime(sendTime) ?? parseSendTime(BIRTHDAY_DEFAULT_SEND_TIME)!;
	return new Date(Date.UTC(date.year, date.month - 1, date.day, 0, minutes) - KST_OFFSET_MS);
}

/** Strictly after `now`. */
export function nextSendAt(now: Date, sendTime: string): Date {
	const today = sendAtOnKstDate(kstDateOf(now), sendTime);
	return today.getTime() > now.getTime() ? today : new Date(today.getTime() + DAY_MS);
}

/** Same time a day later (KST has no DST, so 24h); skips ahead to the next slot after `now` if the bot was down past it. */
export function nextDailyRun(ranAt: Date, now: Date, sendTime: string): Date {
	const next = sendAtOnKstDate(kstDateOf(new Date(ranAt.getTime() + DAY_MS)), sendTime);
	return next.getTime() > now.getTime() ? next : nextSendAt(now, sendTime);
}

/** The day after enabling: nothing is sent on the day it's turned on. */
export function firstActiveDate(now: Date): string {
	return kstDateString(new Date(now.getTime() + DAY_MS));
}

export interface CelebrationGate {
	today: string;
	activeFrom: string | null;
	lastCelebratedOn: string | null;
}

export function shouldCelebrate(gate: CelebrationGate): boolean {
	if (gate.activeFrom && gate.today < gate.activeFrom) return false;
	return gate.lastCelebratedOn !== gate.today;
}

/** Up to 3 names comma-separated, then "A, B, C 외 N명"; stays within the renderer's 64-character cap. */
export function formatBirthdayNames(names: readonly string[]): string {
	const shown = names.slice(0, BIRTHDAY_NAMES_SHOWN);
	const rest = names.length - shown.length;
	let text = shown.join(', ') + (rest > 0 ? ` 외 ${rest}명` : '');
	if (text.length > DISPLAY_NAME_MAX) text = `${text.slice(0, DISPLAY_NAME_MAX - 1)}…`;
	return text;
}

function buildDefaultBirthdayCard(): GreetingConfig {
	const template = GREETING_TEMPLATES.find((item) => item.id === 'confetti-party');
	const image = structuredClone(template?.image ?? DEFAULT_GREETINGS.welcome.image!);
	image.background = { presetId: 'birthday', dataUri: null };
	for (const layer of image.layers) {
		if (layer.type !== 'text') continue;
		if (layer.id === 'title') layer.text = '{유저이름} 님 생일 축하해요!';
		if (layer.id === 'subtitle') layer.text = '{서버}가 함께 축하해요';
	}
	return {
		version: 2,
		enabled: false,
		channelId: null,
		template: '오늘은 {유저}님의 생일이에요. 다 같이 축하해 주세요!',
		useImage: true,
		layout: 'container',
		accentColor: null,
		image
	};
}

/** 생일 축하 카드 기본값 — 컨페티 파티 템플릿에 생일 프리셋 배경을 얹었어요. 여러 명이면 {유저}는 멘션 목록, {유저이름}은 이름 목록이에요 */
export const DEFAULT_BIRTHDAY_CARD: GreetingConfig = buildDefaultBirthdayCard();

/** 카드 종류별 기본 설정 — 대시보드 편집기가 "이미지 켜기"·초기화에 써요 */
export const DEFAULT_CARD_CONFIGS: Record<GreetingCardKind, GreetingConfig> = {
	...DEFAULT_GREETINGS,
	birthday: DEFAULT_BIRTHDAY_CARD
};

export interface BirthdaySettings {
	/** Also holds `enabled` and `channelId`. */
	card: GreetingConfig;
	/** "HH:mm" KST */
	sendTime: string;
	/** 생일 당일에 줄 역할 — 다음 날 회수해요 */
	roleId: string | null;
	/** Null if never enabled. */
	activeFrom: string | null;
}

export const birthdaySettingsInputSchema = z.object({
	card: greetingConfigSchema,
	sendTime: sendTimeSchema,
	roleId: z
		.string()
		.regex(/^\d{17,20}$/)
		.nullable()
});
export type BirthdaySettingsInput = z.infer<typeof birthdaySettingsInputSchema>;

export const BIRTHDAY_SETTINGS_DEFAULTS: BirthdaySettings = {
	card: DEFAULT_BIRTHDAY_CARD,
	sendTime: BIRTHDAY_DEFAULT_SEND_TIME,
	roleId: null,
	activeFrom: null
};

/** Sets `activeFrom` to the next day when switching on, keeps it while already on, clears it when off. */
export function nextActiveFrom(previous: { enabled: boolean; activeFrom: string | null }, nextEnabled: boolean, now: Date): string | null {
	if (!nextEnabled) return null;
	return previous.enabled && previous.activeFrom ? previous.activeFrom : firstActiveDate(now);
}
