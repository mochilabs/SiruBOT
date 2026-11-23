"use client";

import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarClock, ChevronLeft, ChevronRight, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	addDays,
	addMonths,
	clampDateTime,
	compareDates,
	type DateParts,
	displayDateTime,
	formatDate,
	formatDateTime,
	formatTime,
	kstNow,
	monthGrid,
	parseDate,
	parseDateTime,
	parseTime,
	WEEKDAY_LABELS,
	weekdayOf,
} from "@/lib/date-time";
import { cn } from "@/lib/utils";

/** 선택기 공용 속성 — Field 렌더 프롭의 id·describedBy·invalid를 그대로 받아요 */
interface PickerBaseProps {
	id?: string;
	disabled?: boolean;
	placeholder?: string;
	className?: string;
	"aria-describedby"?: string;
	"aria-invalid"?: boolean;
	"aria-label"?: string;
}

export interface DateTimePickerProps extends PickerBaseProps {
	/** "YYYY-MM-DDTHH:mm" (시간대 없는 벽시계 값) — 비어 있으면 아직 고르지 않은 상태예요 */
	value: string;
	onChange: (value: string) => void;
	/** 고를 수 있는 가장 이른/늦은 시각 ("YYYY-MM-DDTHH:mm") */
	min?: string;
	max?: string;
	/** 분 목록 간격 (기본 1분) — 현재 값이 간격에 안 맞으면 그 값도 목록에 들어가요 */
	minuteStep?: number;
}

export interface TimePickerProps extends PickerBaseProps {
	/** "HH:mm" */
	value: string;
	onChange: (value: string) => void;
	minuteStep?: number;
}

const TRIGGER_CLASS =
	"flex h-9 w-full min-w-0 items-center gap-2 rounded-control border-0 bg-input px-3 text-left text-sm text-foreground shadow-control-boundary transition-control duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:shadow-control-boundary-invalid aria-invalid:focus-visible:ring-destructive";
const POPUP_CLASS =
	"pop-in w-max max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-menu border border-border-subtle bg-popover p-3 text-popover-foreground shadow-2xl outline-none";
const DEFAULT_TIME = { hour: 9, minute: 0 };

function minuteOptions(step: number, current: number | null): number[] {
	const options: number[] = [];
	for (let minute = 0; minute < 60; minute += step) options.push(minute);
	if (current !== null && !options.includes(current)) options.push(current);
	return options.sort((a, b) => a - b);
}

/* ------------------------------------------------------------------ 시간 열 ------------------------------------------------------------------ */

interface TimeColumnsProps {
	hour: number | null;
	minute: number | null;
	minuteStep: number;
	isDisabled: (hour: number, minute: number) => boolean;
	onPick: (hour: number, minute: number) => void;
}

/** 시·분 두 열 — 각 열은 listbox이고 방향키로 값을 옮겨요 */
function TimeColumns({ hour, minute, minuteStep, isDisabled, onPick }: TimeColumnsProps) {
	const minutes = useMemo(() => minuteOptions(minuteStep, minute), [minuteStep, minute]);
	const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
	const hourRef = useRef<HTMLDivElement>(null);
	const minuteRef = useRef<HTMLDivElement>(null);

	// 열려 있는 동안 고른 값이 항상 보이게 가운데로 스크롤해요
	useEffect(() => {
		for (const column of [hourRef.current, minuteRef.current]) {
			column?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "center" });
		}
	}, [hour, minute]);

	const hourDisabled = (value: number) => minutes.every((candidate) => isDisabled(value, candidate));

	const move = (event: KeyboardEvent<HTMLDivElement>, kind: "hour" | "minute") => {
		const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
		if (!delta) return;
		event.preventDefault();
		const list = kind === "hour" ? hours : minutes;
		const current = kind === "hour" ? (hour ?? DEFAULT_TIME.hour) : (minute ?? DEFAULT_TIME.minute);
		let index = Math.max(0, list.indexOf(current)) + delta;
		// 못 고르는 값은 건너뛰어요
		while (index >= 0 && index < list.length) {
			const next = list[index];
			const blocked = kind === "hour" ? hourDisabled(next) : isDisabled(hour ?? DEFAULT_TIME.hour, next);
			if (!blocked) {
				if (kind === "hour") onPick(next, minute ?? 0);
				else onPick(hour ?? DEFAULT_TIME.hour, next);
				event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
				return;
			}
			index += delta;
		}
	};

	const optionClass = (selected: boolean, blocked: boolean) =>
		cn(
			"flex h-8 w-full items-center justify-center rounded-control text-sm tabular-nums transition-control duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring",
			selected ? "bg-primary-control font-bold text-primary-control-text" : "text-foreground hover:bg-surface-3",
			blocked && "cursor-not-allowed opacity-40 hover:bg-transparent",
		);

	return (
		<div className="flex gap-2">
			{(
				[
					{ kind: "hour" as const, label: "시", list: hours, current: hour, ref: hourRef },
					{ kind: "minute" as const, label: "분", list: minutes, current: minute, ref: minuteRef },
				] as const
			).map(({ kind, label, list, current, ref }) => (
				<div key={kind} className="w-14">
					<p className="pb-1 text-center text-2xs font-semibold text-muted-foreground">{label}</p>
					<div
						ref={ref}
						role="listbox"
						aria-label={label}
						onKeyDown={(event) => move(event, kind)}
						className="scrollbar-none h-40 space-y-0.5 overflow-y-auto rounded-control bg-surface-2 p-1"
					>
						{list.map((value) => {
							const selected = current === value;
							const blocked = kind === "hour" ? hourDisabled(value) : isDisabled(hour ?? DEFAULT_TIME.hour, value);
							return (
								<button
									key={value}
									type="button"
									role="option"
									data-value={value}
									aria-selected={selected}
									aria-disabled={blocked || undefined}
									tabIndex={selected || (current === null && value === list[0]) ? 0 : -1}
									onClick={() => {
										if (blocked) return;
										if (kind === "hour") onPick(value, minute ?? 0);
										else onPick(hour ?? DEFAULT_TIME.hour, value);
									}}
									className={optionClass(selected, blocked)}
								>
									{String(value).padStart(2, "0")}
								</button>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}

/* ------------------------------------------------------------------ 달력 ------------------------------------------------------------------ */

interface CalendarPanelProps {
	selected: DateParts | null;
	today: DateParts;
	min: DateParts | null;
	max: DateParts | null;
	onSelect: (date: DateParts) => void;
}

/** 월 달력 — 방향키·Home/End·PageUp/PageDown으로 움직이는 grid예요 */
function CalendarPanel({ selected, today, min, max, onSelect }: CalendarPanelProps) {
	const initial = selected ?? today;
	const [focusDate, setFocusDate] = useState<DateParts>(initial);
	const [view, setView] = useState({ year: initial.year, month: initial.month });
	const gridRef = useRef<HTMLDivElement>(null);
	const refocus = useRef(false);

	const cells = useMemo(() => monthGrid(view.year, view.month), [view.year, view.month]);
	const outOfRange = (date: DateParts) => (min !== null && compareDates(date, min) < 0) || (max !== null && compareDates(date, max) > 0);

	// 키보드로 옮긴 뒤에만 새 칸으로 포커스를 따라가요 (마우스로 달만 넘길 땐 훔치지 않아요)
	useEffect(() => {
		if (!refocus.current) return;
		refocus.current = false;
		gridRef.current?.querySelector<HTMLElement>(`[data-date="${formatDate(focusDate)}"]`)?.focus();
	}, [focusDate, view]);

	const goTo = (date: DateParts, focus: boolean) => {
		refocus.current = focus;
		setFocusDate(date);
		setView({ year: date.year, month: date.month });
	};

	const shiftMonth = (delta: number) => {
		const next = addMonths(focusDate, delta);
		setFocusDate(next);
		setView({ year: next.year, month: next.month });
	};

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const week = weekdayOf(focusDate);
		const moves: Record<string, DateParts> = {
			ArrowLeft: addDays(focusDate, -1),
			ArrowRight: addDays(focusDate, 1),
			ArrowUp: addDays(focusDate, -7),
			ArrowDown: addDays(focusDate, 7),
			Home: addDays(focusDate, -week),
			End: addDays(focusDate, 6 - week),
			PageUp: addMonths(focusDate, event.shiftKey ? -12 : -1),
			PageDown: addMonths(focusDate, event.shiftKey ? 12 : 1),
		};
		const next = moves[event.key];
		if (!next) return;
		event.preventDefault();
		goTo(next, true);
	};

	return (
		<div className="w-[17.5rem]">
			<div className="flex items-center justify-between pb-2">
				<Button variant="icon" size="icon-sm" aria-label="이전 달" onClick={() => shiftMonth(-1)}>
					<ChevronLeft size={16} aria-hidden />
				</Button>
				<p aria-live="polite" className="text-sm font-bold tabular-nums text-foreground">
					{view.year}년 {view.month}월
				</p>
				<Button variant="icon" size="icon-sm" aria-label="다음 달" onClick={() => shiftMonth(1)}>
					<ChevronRight size={16} aria-hidden />
				</Button>
			</div>
			<div ref={gridRef} role="grid" aria-label={`${view.year}년 ${view.month}월`} onKeyDown={onKeyDown}>
				<div role="row" className="grid grid-cols-7 pb-1">
					{WEEKDAY_LABELS.map((label, index) => (
						<span
							key={label}
							role="columnheader"
							className={cn(
								"flex h-8 items-center justify-center text-2xs font-semibold",
								index === 0 ? "text-destructive" : "text-muted-foreground",
							)}
						>
							{label}
						</span>
					))}
				</div>
				<div className="grid grid-cols-7 gap-y-0.5">
					{cells.map(({ date, inMonth }) => {
						const key = formatDate(date);
						const isSelected = selected !== null && compareDates(date, selected) === 0;
						const isToday = compareDates(date, today) === 0;
						const blocked = outOfRange(date);
						return (
							<div key={key} role="gridcell" aria-selected={isSelected} className="flex justify-center">
								<button
									type="button"
									data-date={key}
									tabIndex={compareDates(date, focusDate) === 0 ? 0 : -1}
									aria-disabled={blocked || undefined}
									aria-current={isToday ? "date" : undefined}
									aria-label={`${date.year}년 ${date.month}월 ${date.day}일 ${WEEKDAY_LABELS[weekdayOf(date)]}요일`}
									onClick={() => {
										if (blocked) return;
										setFocusDate(date);
										onSelect(date);
									}}
									className={cn(
										"flex h-9 w-9 items-center justify-center rounded-control text-sm tabular-nums transition-control duration-fast outline-none focus-visible:ring-2 focus-visible:ring-ring",
										isSelected
											? "bg-primary-control font-bold text-primary-control-text"
											: cn(
													"hover:bg-surface-3",
													inMonth ? "text-foreground" : "text-muted-foreground/60",
													isToday && "font-bold text-primary-text shadow-control-boundary",
												),
										blocked && "cursor-not-allowed opacity-40 hover:bg-transparent",
									)}
								>
									{date.day}
								</button>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/* ------------------------------------------------------------------ 날짜+시각 ------------------------------------------------------------------ */

/**
 * 날짜·시각 선택기 — 브라우저 기본 `datetime-local` 대신 디자인 시스템 토큰으로 직접 그린 팝오버예요.
 * 값은 시간대 없는 "YYYY-MM-DDTHH:mm" 문자열이라 한국 시간으로 받는 API에 그대로 맞아요.
 * min·max 밖 날짜는 비활성이고, 날짜를 바꿔서 시각이 범위를 벗어나면 가까운 끝으로 맞춰요.
 */
export function DateTimePicker({
	id,
	value,
	onChange,
	min,
	max,
	minuteStep = 1,
	disabled = false,
	placeholder = "날짜와 시간을 선택해 주세요",
	className,
	...aria
}: DateTimePickerProps) {
	const parsed = parseDateTime(value);
	const minParts = min ? parseDateTime(min) : null;
	const maxParts = max ? parseDateTime(max) : null;
	const today = useMemo(() => parseDate(kstNow().slice(0, 10)) as DateParts, []);

	const commit = (date: DateParts, hour: number, minute: number) => {
		onChange(clampDateTime(formatDateTime({ ...date, hour, minute }), min, max));
	};

	const blockedTime = (hour: number, minute: number) => {
		if (!parsed) return false;
		const candidate = formatDateTime({ ...parsed, hour, minute });
		return (min !== undefined && candidate < min) || (max !== undefined && candidate > max);
	};

	const defaultDate = parsed ?? (minParts ? { year: minParts.year, month: minParts.month, day: minParts.day } : today);

	return (
		<Popover.Root>
			<Popover.Trigger id={id} disabled={disabled} className={cn(TRIGGER_CLASS, className)} {...aria}>
				<CalendarClock size={16} aria-hidden className="shrink-0 text-muted-foreground" />
				<span className={cn("min-w-0 flex-1 truncate tabular-nums", !parsed && "text-muted-foreground")}>
					{displayDateTime(value) ?? placeholder}
				</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner sideOffset={6} align="start" collisionPadding={8} className="isolate z-(--z-overlay) outline-none">
					<Popover.Popup className={POPUP_CLASS}>
						<Popover.Title className="sr-only">날짜와 시간 선택</Popover.Title>
						<div className="flex flex-col gap-3 sm:flex-row">
							<CalendarPanel
								selected={parsed}
								today={today}
								min={minParts}
								max={maxParts}
								onSelect={(date) => commit(date, parsed?.hour ?? minParts?.hour ?? DEFAULT_TIME.hour, parsed?.minute ?? DEFAULT_TIME.minute)}
							/>
							<div className="sm:border-l sm:border-border-subtle sm:pl-3">
								<TimeColumns
									hour={parsed?.hour ?? null}
									minute={parsed?.minute ?? null}
									minuteStep={minuteStep}
									isDisabled={blockedTime}
									onPick={(hour, minute) => commit(defaultDate, hour, minute)}
								/>
							</div>
						</div>
						<div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
							<p className="min-w-0 truncate text-xs tabular-nums text-muted-foreground">{displayDateTime(value) ?? "아직 고르지 않았어요"}</p>
							<Popover.Close render={<Button variant="primary" size="sm" />}>확인</Popover.Close>
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

/* ------------------------------------------------------------------ 시각만 ------------------------------------------------------------------ */

/** 시각 선택기 — 날짜 없이 "HH:mm"만 골라요 (예: 매일 보내는 시각) */
export function TimePicker({
	id,
	value,
	onChange,
	minuteStep = 1,
	disabled = false,
	placeholder = "시간을 선택해 주세요",
	className,
	...aria
}: TimePickerProps) {
	const parsed = parseTime(value);
	return (
		<Popover.Root>
			<Popover.Trigger id={id} disabled={disabled} className={cn(TRIGGER_CLASS, className)} {...aria}>
				<Clock size={16} aria-hidden className="shrink-0 text-muted-foreground" />
				<span className={cn("min-w-0 flex-1 truncate tabular-nums", !parsed && "text-muted-foreground")}>{parsed ? value : placeholder}</span>
			</Popover.Trigger>
			<Popover.Portal>
				<Popover.Positioner sideOffset={6} align="start" collisionPadding={8} className="isolate z-(--z-overlay) outline-none">
					<Popover.Popup className={POPUP_CLASS}>
						<Popover.Title className="sr-only">시간 선택</Popover.Title>
						<TimeColumns
							hour={parsed?.hour ?? null}
							minute={parsed?.minute ?? null}
							minuteStep={minuteStep}
							isDisabled={() => false}
							onPick={(hour, minute) => onChange(formatTime(hour, minute))}
						/>
						<div className="mt-3 flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
							<p className="text-xs tabular-nums text-muted-foreground">{parsed ? value : "아직 고르지 않았어요"}</p>
							<Popover.Close render={<Button variant="primary" size="sm" />}>확인</Popover.Close>
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}
