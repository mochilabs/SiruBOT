"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Portal, usePopoverCoords } from "./portal";

/* ─────────────────────────── types ─────────────────────────── */

interface DatePickerProps {
	value?: Date | null;
	onChange?: (date: Date | null) => void;
	placeholder?: string;
	disabled?: boolean;
	minDate?: Date;
	maxDate?: Date;
	className?: string;
}

/* ─────────────────────────── helpers ─────────────────────────── */

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

function isSameDay(a: Date, b: Date): boolean {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getDaysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
	return new Date(year, month, 1).getDay();
}

function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}. ${m}. ${d}`;
}

/* ─────────────────────────── component ─────────────────────────── */

export function DatePicker({
	value,
	onChange,
	placeholder = "날짜를 선택해 주세요",
	disabled = false,
	minDate,
	maxDate,
	className = "",
}: DatePickerProps) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const today = useMemo(() => new Date(), []);

	const [viewYear, setViewYear] = useState(value?.getFullYear() ?? today.getFullYear());
	const [viewMonth, setViewMonth] = useState(value?.getMonth() ?? today.getMonth());

	const coords = usePopoverCoords(triggerRef, open);

	// Click outside
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	const goToPrevMonth = () => {
		if (viewMonth === 0) {
			setViewYear((y) => y - 1);
			setViewMonth(11);
		} else {
			setViewMonth((m) => m - 1);
		}
	};

	const goToNextMonth = () => {
		if (viewMonth === 11) {
			setViewYear((y) => y + 1);
			setViewMonth(0);
		} else {
			setViewMonth((m) => m + 1);
		}
	};

	const selectDate = useCallback(
		(day: number) => {
			const date = new Date(viewYear, viewMonth, day);
			onChange?.(date);
			setOpen(false);
		},
		[viewYear, viewMonth, onChange],
	);

	const isDateDisabled = useCallback(
		(date: Date) => {
			if (minDate && date < minDate) return true;
			if (maxDate && date > maxDate) return true;
			return false;
		},
		[minDate, maxDate],
	);

	// Build calendar grid
	const daysInMonth = getDaysInMonth(viewYear, viewMonth);
	const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
	const days: (number | null)[] = [];
	for (let i = 0; i < firstDay; i++) days.push(null);
	for (let i = 1; i <= daysInMonth; i++) days.push(i);

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			{/* Trigger */}
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				onClick={() => setOpen(!open)}
				className={`
					w-full h-11 px-4 flex items-center justify-between gap-2
					glass-panel text-sm font-medium
					transition-all duration-300 cursor-pointer
					${disabled ? "opacity-50 pointer-events-none" : "hover:border-primary/30"}
					${open ? "ring-2 ring-primary/20 border-primary/30" : ""}
				`}
			>
				<span className={value ? "text-foreground" : "text-muted-foreground/50"}>
					{value ? formatDate(value) : placeholder}
				</span>
				<ChevronDown
					className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{/* Calendar */}
			<AnimatePresence>
				{open && (
					<Portal>
						{/* Backdrop */}
						<div
							className="fixed inset-0 z-[190] cursor-default"
							onClick={() => setOpen(false)}
						/>
						<m.div
							initial={{ opacity: 0, scale: 0.95, y: -4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -4 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="fixed z-[200] mt-2 glass-panel p-4 shadow-2xl w-[300px]"
							style={{
								top: coords.top,
								left: coords.left,
							}}
						>
							{/* Header */}
							<div className="flex items-center justify-between mb-4">
								<button
									type="button"
									onClick={goToPrevMonth}
									className="p-1.5 rounded-xl hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									aria-label="이전 달"
								>
									<ChevronLeft className="h-4 w-4" />
								</button>
								<span className="text-sm font-black tracking-tight text-foreground">
									{viewYear}년 {MONTHS[viewMonth]}
								</span>
								<button
									type="button"
									onClick={goToNextMonth}
									className="p-1.5 rounded-xl hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									aria-label="다음 달"
								>
									<ChevronRight className="h-4 w-4" />
								</button>
							</div>

							{/* Weekday headers */}
							<div className="grid grid-cols-7 mb-1">
								{WEEKDAYS.map((d) => (
									<span
										key={d}
										className="text-center text-xs font-black uppercase tracking-widest text-muted-foreground/40 py-1"
									>
										{d}
									</span>
								))}
							</div>

							{/* Days grid */}
							<div className="grid grid-cols-7" role="grid" aria-label="날짜 선택">
								{days.map((day, i) => {
									if (day === null) {
										return <div key={`empty-${i}`} />;
									}

									const date = new Date(viewYear, viewMonth, day);
									const isToday = isSameDay(date, today);
									const isSelected = value ? isSameDay(date, value) : false;
									const isDisabled = isDateDisabled(date);
									const isSunday = date.getDay() === 0;

									return (
										<button
											key={day}
											type="button"
											disabled={isDisabled}
											onClick={() => selectDate(day)}
											className={`
												h-9 w-full rounded-xl text-sm font-medium transition-all cursor-pointer
												${isDisabled ? "opacity-30 pointer-events-none" : "hover:bg-accent/50"}
												${isSelected ? "bg-primary text-white font-bold shadow-lg shadow-primary/20" : ""}
												${isToday && !isSelected ? "ring-1 ring-primary/40 text-primary font-bold" : ""}
												${isSunday && !isSelected ? "text-rose-500" : ""}
												${!isSelected && !isToday && !isSunday ? "text-foreground" : ""}
											`}
										>
											{day}
										</button>
									);
								})}
							</div>

							{/* Today shortcut */}
							<div className="mt-3 pt-3 border-t border-border/40 flex justify-center">
								<button
									type="button"
									onClick={() => {
										setViewYear(today.getFullYear());
										setViewMonth(today.getMonth());
										onChange?.(today);
										setOpen(false);
									}}
									className="text-xs font-bold text-primary hover:text-primary/80 transition-colors cursor-pointer"
								>
									오늘로 이동
								</button>
							</div>
						</m.div>
					</Portal>
				)}
			</AnimatePresence>
		</div>
	);
}
