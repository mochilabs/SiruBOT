import { z } from 'zod';
import { nextRunAt, type Recurrence } from './jobRecurrence.js';

export { nextRunAt, type Recurrence } from './jobRecurrence.js';

export const SCHEDULED_MESSAGE_KIND = 'scheduled-message';

export const SCHEDULED_MESSAGE_CONTENT_MAX = 2000;
export const SCHEDULED_MESSAGE_MAX_ACTIVE_DEFAULT = 25;
export const SCHEDULED_MESSAGE_MAX_ACTIVE_LIMIT = 100;
export const SCHEDULED_MESSAGE_MIN_INTERVAL_DEFAULT = 10;
export const SCHEDULED_MESSAGE_MIN_INTERVAL_LIMIT = 1440;
export const SCHEDULED_MESSAGE_MIN_LEAD_MS = 60_000;
export const SCHEDULED_MESSAGE_MAX_LEAD_MS = 366 * 24 * 60 * 60_000;
export const SCHEDULED_MESSAGE_MISSED_SKIP_MS = 3 * 60 * 60_000;
const CONFLICT_HORIZON_MS = 62 * 24 * 60 * 60_000;
const CONFLICT_MAX_OCCURRENCES = 500;

const KST_OFFSET_MS = 9 * 60 * 60_000;
const snowflake = z.string().regex(/^\d{17,20}$/, '올바른 ID 형식이 아니에요.');
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const EVERYONE_PATTERN = /@(everyone|here)/i;

export const scheduledMessageContentSchema = z
	.string()
	.trim()
	.min(1, '메시지 내용을 입력해 주세요.')
	.max(SCHEDULED_MESSAGE_CONTENT_MAX, `메시지는 ${SCHEDULED_MESSAGE_CONTENT_MAX}자까지 쓸 수 있어요.`)
	.refine((text) => !EVERYONE_PATTERN.test(text), '@everyone, @here 멘션은 예약 메시지에 쓸 수 없어요.');

export function parseKstDateTime(text: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/.exec(text.trim());
	if (!match) return null;
	const [year, month, day, hour, minute] = match.slice(1).map(Number) as [number, number, number, number, number];
	const utc = Date.UTC(year, month - 1, day, hour, minute);
	const check = new Date(utc);
	if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day || hour > 23 || minute > 59) return null;
	return new Date(utc - KST_OFFSET_MS);
}

export function formatKstDateTime(date: Date): string {
	const kst = new Date(date.getTime() + KST_OFFSET_MS);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())} ${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
}

export const SCHEDULED_MESSAGE_REPEATS = ['none', 'daily', 'weekly', 'monthly'] as const;
export type ScheduledMessageRepeat = (typeof SCHEDULED_MESSAGE_REPEATS)[number];

export const SCHEDULED_MESSAGE_REPEAT_LABELS: Record<ScheduledMessageRepeat, string> = {
	none: '한 번',
	daily: '매일',
	weekly: '매주',
	monthly: '매월'
};

export function buildRecurrence(repeat: ScheduledMessageRepeat, firstRunAt: Date): Recurrence | undefined {
	const kst = new Date(firstRunAt.getTime() + KST_OFFSET_MS);
	const p = (n: number) => String(n).padStart(2, '0');
	const time = `${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`;
	switch (repeat) {
		case 'none':
			return undefined;
		case 'daily':
			return { type: 'daily', time };
		case 'weekly':
			return { type: 'weekly', weekday: kst.getUTCDay(), time };
		case 'monthly':
			return { type: 'monthly', day: kst.getUTCDate(), time };
	}
}

const recurrenceSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('daily'), time: timeOfDay }),
	z.object({ type: z.literal('weekly'), weekday: z.number().int().min(0).max(6), time: timeOfDay }),
	z.object({ type: z.literal('monthly'), day: z.number().int().min(1).max(31), time: timeOfDay })
]);

export function describeRecurrence(rule: Recurrence | undefined): string {
	if (!rule) return '한 번';
	switch (rule.type) {
		case 'daily':
			return `매일 ${rule.time}`;
		case 'weekly':
			return `매주 ${'일월화수목금토'[rule.weekday]}요일 ${rule.time}`;
		case 'monthly':
			return `매월 ${rule.day}일 ${rule.time}`;
	}
}

export const scheduledMessagePayloadSchema = z.object({
	seriesId: z.string().uuid(),
	channelId: snowflake,
	content: scheduledMessageContentSchema,
	recurrence: recurrenceSchema.optional()
});
export type ScheduledMessagePayload = z.infer<typeof scheduledMessagePayloadSchema>;

export function parseScheduledMessagePayload(value: unknown): ScheduledMessagePayload | null {
	const parsed = scheduledMessagePayloadSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export const scheduledMessageSettingsSchema = z.object({
	maxActive: z
		.number()
		.int('활성 예약 상한은 정수여야 해요.')
		.min(1, '활성 예약 상한은 1 이상이어야 해요.')
		.max(SCHEDULED_MESSAGE_MAX_ACTIVE_LIMIT, `활성 예약 상한은 ${SCHEDULED_MESSAGE_MAX_ACTIVE_LIMIT} 이하여야 해요.`),
	minIntervalMinutes: z
		.number()
		.int('최소 간격은 정수(분)여야 해요.')
		.min(1, '최소 간격은 1분 이상이어야 해요.')
		.max(SCHEDULED_MESSAGE_MIN_INTERVAL_LIMIT, `최소 간격은 ${SCHEDULED_MESSAGE_MIN_INTERVAL_LIMIT}분 이하여야 해요.`)
});
export type ScheduledMessageSettings = z.infer<typeof scheduledMessageSettingsSchema>;
export const scheduledMessageSettingsPatchSchema = scheduledMessageSettingsSchema.partial();

export const SCHEDULED_MESSAGE_SETTINGS_DEFAULTS: ScheduledMessageSettings = {
	maxActive: SCHEDULED_MESSAGE_MAX_ACTIVE_DEFAULT,
	minIntervalMinutes: SCHEDULED_MESSAGE_MIN_INTERVAL_DEFAULT
};

export const createScheduledMessageSchema = z.object({
	channelId: snowflake,
	content: scheduledMessageContentSchema,
	runAt: z.string().refine((text) => parseKstDateTime(text) !== null, '일시는 "2026-12-25 09:00"처럼 적어 주세요. (한국 시간)'),
	repeat: z.enum(SCHEDULED_MESSAGE_REPEATS)
});
export type CreateScheduledMessageInput = z.infer<typeof createScheduledMessageSchema>;

export interface ActiveScheduledMessage {
	seriesId: string;
	channelId: string;
	runAt: Date;
	recurrence?: Recurrence;
}

export type ScheduleRejectCode = 'past' | 'too-far' | 'limit' | 'interval';
export type ScheduleCheck = { ok: true } | { ok: false; code: ScheduleRejectCode; message: string };

function occurrences(first: Date, recurrence: Recurrence | undefined, until: number): number[] {
	const list = [first.getTime()];
	if (!recurrence) return list;
	let last = first;
	while (list.length < CONFLICT_MAX_OCCURRENCES) {
		last = nextRunAt(recurrence, last);
		if (last.getTime() > until) break;
		list.push(last.getTime());
	}
	return list;
}

export function checkNewScheduledMessage(input: {
	now: Date;
	runAt: Date;
	channelId: string;
	recurrence?: Recurrence;
	existing: readonly ActiveScheduledMessage[];
	settings: ScheduledMessageSettings;
}): ScheduleCheck {
	const { now, runAt, channelId, recurrence, existing, settings } = input;
	if (runAt.getTime() < now.getTime() + SCHEDULED_MESSAGE_MIN_LEAD_MS) {
		return { ok: false, code: 'past', message: '지금부터 1분 뒤 이후의 시각을 골라 주세요.' };
	}
	if (runAt.getTime() > now.getTime() + SCHEDULED_MESSAGE_MAX_LEAD_MS) {
		return { ok: false, code: 'too-far', message: '예약은 앞으로 1년 안의 시각만 고를 수 있어요.' };
	}
	const active = new Set(existing.map((item) => item.seriesId));
	if (active.size >= settings.maxActive) {
		return { ok: false, code: 'limit', message: `이 서버의 활성 예약은 최대 ${settings.maxActive}개예요. 하나를 지우고 다시 시도해 주세요.` };
	}
	const gap = settings.minIntervalMinutes * 60_000;
	const until = runAt.getTime() + CONFLICT_HORIZON_MS;
	const mine = occurrences(runAt, recurrence, until);
	for (const other of existing) {
		if (other.channelId !== channelId) continue;
		for (const theirs of occurrences(other.runAt, other.recurrence, until)) {
			if (mine.some((time) => Math.abs(time - theirs) < gap)) {
				return {
					ok: false,
					code: 'interval',
					message: `같은 채널의 예약은 ${settings.minIntervalMinutes}분 이상 간격을 두어야 해요. (겹치는 시각: ${formatKstDateTime(new Date(theirs))})`
				};
			}
		}
	}
	return { ok: true };
}
