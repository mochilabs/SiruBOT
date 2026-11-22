import { z } from 'zod';
import { DEFAULT_GREETINGS, GREETING_TEMPLATES, greetingConfigSchema, type GreetingConfig, type GreetingKind } from './memberGreeting.js';

/**
 * 생일 축하 계약 — 서버별 축하 설정, 날짜·시각 계산을 봇과 대시보드가 함께 써요.
 *
 * - 생일 자체(월/일)는 `User.birthMonth`/`birthDay`(`./birthday.ts`)이고, 연도와 나이는 저장하지 않아요.
 * - 서버마다 본인이 켠 사람(`BirthdayOptIn`)만 축하해요 (D-17).
 * - 축하 카드는 인사 카드와 같은 `GreetingConfig`(메시지 템플릿, 채널, 이미지 레이어, 레이아웃, 강조색)를 그대로 써서
 *   봇의 카드 렌더러와 대시보드 편집기를 재사용해요. `BirthdaySettings.config`에 저장해요.
 * - 실행은 `ScheduledJob`(kind `birthday_daily`)이 서버마다 하루에 한 번이고, 모든 날짜·시각은 Asia/Seoul(KST, UTC+9 고정)이에요.
 */

export const BIRTHDAY_DAILY_KIND = 'birthday_daily';
export const BIRTHDAY_DEFAULT_SEND_TIME = '09:00';
/** 한 번에 한 카드에 담는 생일자 수 상한 — 그 이상은 이름만 "외 N명"으로 줄여요 */
export const BIRTHDAY_NAMES_SHOWN = 3;
/** 카드 렌더러가 받는 표시 이름 상한(문자) */
const DISPLAY_NAME_MAX = 64;

/** 카드 종류 — 환영·작별에 생일이 더해져요. data-api 렌더 키와 대시보드 편집기 문구가 구분해요 */
export type GreetingCardKind = GreetingKind | 'birthday';

const KST_OFFSET_MS = 9 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/* ---------------------------------------------------------------- 날짜 */

export interface KstDate {
	year: number;
	month: number;
	day: number;
}

export function kstDateOf(date: Date): KstDate {
	const kst = new Date(date.getTime() + KST_OFFSET_MS);
	return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1, day: kst.getUTCDate() };
}

/** "YYYY-MM-DD" (KST 날짜) — 문자열 비교가 곧 날짜 순서예요 */
export function kstDateString(date: Date): string {
	const { year, month, day } = kstDateOf(date);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${year}-${p(month)}-${p(day)}`;
}

export function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 오늘(KST) 축하할 생일(월/일) 목록 — 보통은 오늘 하나예요.
 * 2월 29일생은 평년에 2월 28일로 당겨서 축하하니(D-17), 평년의 2월 28일에는 2/29도 함께 돌려줘요.
 */
export function birthdayDatesFor(today: KstDate): { month: number; day: number }[] {
	const dates = [{ month: today.month, day: today.day }];
	if (today.month === 2 && today.day === 28 && !isLeapYear(today.year)) dates.push({ month: 2, day: 29 });
	return dates;
}

/** 저장된 생일(month/day)이 오늘(KST) 축하 대상인지 */
export function isBirthdayToday(month: number, day: number, today: KstDate): boolean {
	return birthdayDatesFor(today).some((date) => date.month === month && date.day === day);
}

/* ---------------------------------------------------------------- 보내는 시각 */

const SEND_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const sendTimeSchema = z.string().regex(SEND_TIME_PATTERN, '시각은 09:00처럼 적어 주세요.');

/** "HH:mm" → 자정부터의 분. 형식이 틀리면 null */
export function parseSendTime(time: string): number | null {
	const match = SEND_TIME_PATTERN.exec(time);
	return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

/** 그 KST 날짜의 보내는 시각을 UTC Date로 */
export function sendAtOnKstDate(date: KstDate, sendTime: string): Date {
	const minutes = parseSendTime(sendTime) ?? parseSendTime(BIRTHDAY_DEFAULT_SEND_TIME)!;
	return new Date(Date.UTC(date.year, date.month - 1, date.day, 0, minutes) - KST_OFFSET_MS);
}

/** `now` 이후(같은 시각 제외)의 가장 이른 보내는 시각 */
export function nextSendAt(now: Date, sendTime: string): Date {
	const today = sendAtOnKstDate(kstDateOf(now), sendTime);
	return today.getTime() > now.getTime() ? today : new Date(today.getTime() + DAY_MS);
}

/**
 * 방금 돈 회차(`ranAt`)의 다음 회차 — 하루 뒤 같은 시각이에요 (KST는 서머타임이 없어 24시간이에요).
 * 봇이 오래 꺼져 있어 그 시각도 이미 지났으면 `now` 이후의 가장 이른 시각으로 건너뛰어요.
 */
export function nextDailyRun(ranAt: Date, now: Date, sendTime: string): Date {
	const next = sendAtOnKstDate(kstDateOf(new Date(ranAt.getTime() + DAY_MS)), sendTime);
	return next.getTime() > now.getTime() ? next : nextSendAt(now, sendTime);
}

/** 새로 켠 서버가 축하를 시작하는 날(KST, 다음 날) — 켠 날에는 보내지 않아요 (D-17) */
export function firstActiveDate(now: Date): string {
	return kstDateString(new Date(now.getTime() + DAY_MS));
}

export interface CelebrationGate {
	today: string;
	/** 켠 다음 날부터 — 비어 있으면 제한 없음 */
	activeFrom: string | null;
	/** 마지막으로 축하를 보낸 날 */
	lastCelebratedOn: string | null;
}

/** 오늘 축하를 보내도 되는지 — 켠 날에는 쉬고, 같은 날 두 번 보내지 않아요 */
export function shouldCelebrate(gate: CelebrationGate): boolean {
	if (gate.activeFrom && gate.today < gate.activeFrom) return false;
	return gate.lastCelebratedOn !== gate.today;
}

/* ---------------------------------------------------------------- 문구 */

/** 한 카드에 담는 이름 — 3명까지는 쉼표로, 더 많으면 "A, B, C 외 N명". 렌더러 상한(64자)을 넘지 않아요 */
export function formatBirthdayNames(names: readonly string[]): string {
	const shown = names.slice(0, BIRTHDAY_NAMES_SHOWN);
	const rest = names.length - shown.length;
	let text = shown.join(', ') + (rest > 0 ? ` 외 ${rest}명` : '');
	if (text.length > DISPLAY_NAME_MAX) text = `${text.slice(0, DISPLAY_NAME_MAX - 1)}…`;
	return text;
}

/* ---------------------------------------------------------------- 설정 */

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

/** 서버별 생일 축하 설정 — 대시보드가 저장하고 봇이 읽어요 */
export interface BirthdaySettings {
	/** 카드·메시지 설정. `enabled`와 `channelId`도 여기에 있어요 */
	card: GreetingConfig;
	/** 보내는 시각 "HH:mm" (KST) */
	sendTime: string;
	/** 생일 당일에 줄 역할 — 다음 날 회수해요 */
	roleId: string | null;
	/** 켠 다음 날부터 — 비어 있으면 아직 켠 적이 없어요 */
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

/** 저장 때 `activeFrom`을 정해요 — 꺼져 있다가 켜는 순간(또는 처음 켤 때) 다음 날로 잡고, 이미 켜져 있으면 그대로 둬요. 끄면 비워요 */
export function nextActiveFrom(previous: { enabled: boolean; activeFrom: string | null }, nextEnabled: boolean, now: Date): string | null {
	if (!nextEnabled) return null;
	return previous.enabled && previous.activeFrom ? previous.activeFrom : firstActiveDate(now);
}
