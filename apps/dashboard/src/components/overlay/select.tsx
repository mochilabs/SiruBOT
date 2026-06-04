"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Portal, usePopoverCoords } from "./portal";

/* ─────────────────────────── types ─────────────────────────── */

export interface SelectOption {
	value: string;
	label: string;
	icon?: React.ReactNode;
	group?: string;
	disabled?: boolean;
}

interface SelectBaseProps {
	options: SelectOption[];
	placeholder?: string;
	searchable?: boolean;
	searchPlaceholder?: string;
	disabled?: boolean;
	className?: string;
}

interface SingleSelectProps extends SelectBaseProps {
	multiple?: false;
	value?: string;
	onChange?: (value: string) => void;
}

interface MultiSelectProps extends SelectBaseProps {
	multiple: true;
	value?: string[];
	onChange?: (value: string[]) => void;
}

type SelectProps = SingleSelectProps | MultiSelectProps;

/* ─────────────────────────── component ─────────────────────────── */

export function Select(props: SelectProps) {
	const {
		options,
		placeholder = "선택해 주세요",
		searchable = false,
		searchPlaceholder = "검색...",
		disabled = false,
		className = "",
	} = props;

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const coords = usePopoverCoords(triggerRef, open);

	const isMulti = props.multiple === true;
	const selectedValues = isMulti
		? (props.value ?? [])
		: props.value
			? [props.value]
			: [];

	// Group options
	const groups = useMemo(() => {
		const filtered = options.filter(
			(o) =>
				!search ||
				o.label.toLowerCase().includes(search.toLowerCase()),
		);
		const grouped = new Map<string, SelectOption[]>();
		for (const opt of filtered) {
			const g = opt.group ?? "";
			if (!grouped.has(g)) grouped.set(g, []);
			grouped.get(g)!.push(opt);
		}
		return grouped;
	}, [options, search]);

	const flatFiltered = useMemo(
		() => Array.from(groups.values()).flat().filter((o) => !o.disabled),
		[groups],
	);

	const close = useCallback(() => {
		setOpen(false);
		setSearch("");
		setActiveIndex(-1);
	}, []);

	const toggleOption = useCallback(
		(value: string) => {
			if (isMulti) {
				const prev = (props as MultiSelectProps).value ?? [];
				const next = prev.includes(value)
					? prev.filter((v) => v !== value)
					: [...prev, value];
				(props as MultiSelectProps).onChange?.(next);
			} else {
				(props as SingleSelectProps).onChange?.(value);
				close();
			}
		},
		[isMulti, props, close],
	);

	// Click outside
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) close();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open, close]);

	// Focus search on open
	useEffect(() => {
		if (open && searchable) {
			setTimeout(() => searchRef.current?.focus(), 50);
		}
	}, [open, searchable]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!open) {
			if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				setOpen(true);
				setActiveIndex(0);
			}
			return;
		}
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActiveIndex((p) => (p + 1) % flatFiltered.length);
				break;
			case "ArrowUp":
				e.preventDefault();
				setActiveIndex((p) => (p - 1 + flatFiltered.length) % flatFiltered.length);
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				if (activeIndex >= 0 && flatFiltered[activeIndex]) {
					toggleOption(flatFiltered[activeIndex].value);
				}
				break;
			case "Escape":
				e.preventDefault();
				close();
				break;
		}
	};

	// Display label
	const displayLabel = useMemo(() => {
		if (selectedValues.length === 0) return null;
		if (!isMulti) {
			return options.find((o) => o.value === selectedValues[0])?.label;
		}
		return `${selectedValues.length}개 선택됨`;
	}, [selectedValues, options, isMulti]);

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			{/* Trigger */}
			<button
				ref={triggerRef}
				type="button"
				role="combobox"
				aria-expanded={open}
				aria-haspopup="listbox"
				disabled={disabled}
				onClick={() => (open ? close() : setOpen(true))}
				onKeyDown={handleKeyDown}
				className={`
					w-full h-11 px-4 flex items-center justify-between gap-2
					glass-panel text-sm font-medium
					transition-all duration-300 cursor-pointer
					${disabled ? "opacity-50 pointer-events-none" : "hover:border-primary/30"}
					${open ? "ring-2 ring-primary/20 border-primary/30" : ""}
				`}
			>
				<span className={displayLabel ? "text-foreground" : "text-muted-foreground/50"}>
					{displayLabel ?? placeholder}
				</span>
				<ChevronDown
					className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{/* Multi-select pills */}
			{isMulti && selectedValues.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mt-2">
					{selectedValues.map((v) => {
						const opt = options.find((o) => o.value === v);
						return (
							<span
								key={v}
								className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary"
							>
								{opt?.label ?? v}
								<button
									type="button"
									onClick={() => toggleOption(v)}
									className="p-0.5 rounded-full hover:bg-primary/20 transition-colors cursor-pointer"
									aria-label={`${opt?.label ?? v} 제거`}
								>
									<X className="h-2.5 w-2.5" />
								</button>
							</span>
						);
					})}
				</div>
			)}

			{/* Dropdown */}
			<AnimatePresence>
				{open && (
					<Portal>
						{/* Backdrop */}
						<div
							className="fixed inset-0 z-[190] cursor-default"
							onClick={close}
						/>
						<m.div
							role="listbox"
							aria-multiselectable={isMulti}
							initial={{ opacity: 0, scale: 0.95, y: -4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -4 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="fixed z-[200] glass-panel p-1.5 shadow-2xl max-h-64 overflow-y-auto"
							style={{
								top: coords.top + 8,
								left: coords.left,
								width: coords.width,
							}}
						>
							{/* Search */}
							{searchable && (
								<div className="relative mb-1.5">
									<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
									<input
										ref={searchRef}
										type="text"
										value={search}
										onChange={(e) => {
											setSearch(e.target.value);
											setActiveIndex(0);
										}}
										onKeyDown={handleKeyDown}
										placeholder={searchPlaceholder}
										className="w-full h-9 pl-9 pr-3 bg-transparent border-b border-border/40 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
									/>
								</div>
							)}

							{/* Options */}
							{Array.from(groups.entries()).map(([groupName, groupOptions], gi) => (
								<div key={groupName || gi}>
									{groupName && (
										<p className="px-3 py-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground/40">
											{groupName}
										</p>
									)}
									{groupOptions.map((opt) => {
										const isSelected = selectedValues.includes(opt.value);
										const flatIdx = flatFiltered.indexOf(opt);
										const isActive = flatIdx === activeIndex;

										return (
											<button
												key={opt.value}
												type="button"
												role="option"
												aria-selected={isSelected}
												disabled={opt.disabled}
												tabIndex={-1}
												onClick={() => toggleOption(opt.value)}
												onMouseEnter={() => {
													if (!opt.disabled) setActiveIndex(flatIdx);
												}}
												className={`
													w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer
													${opt.disabled ? "opacity-40 pointer-events-none" : ""}
													${isActive ? "bg-accent/80" : "hover:bg-accent/50"}
												`}
											>
												{opt.icon && (
													<span className="shrink-0 h-4 w-4 flex items-center justify-center">
														{opt.icon}
													</span>
												)}
												<span className="flex-1 text-left truncate text-foreground">
													{opt.label}
												</span>
												{isSelected && (
													<Check className="h-4 w-4 text-primary shrink-0" />
												)}
											</button>
										);
									})}
								</div>
							))}

							{flatFiltered.length === 0 && (
								<p className="py-6 text-center text-sm text-muted-foreground/60 font-medium">
									검색 결과가 없어요
								</p>
							)}
						</m.div>
					</Portal>
				)}
			</AnimatePresence>
		</div>
	);
}
