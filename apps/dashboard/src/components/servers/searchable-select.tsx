"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SearchableOption {
	value: string;
	label: string;
	icon?: React.ReactNode;
	group?: string;
	disabled?: boolean;
}

interface BaseProps {
	options: SearchableOption[];
	placeholder?: string;
	searchable?: boolean;
	searchPlaceholder?: string;
	disabled?: boolean;
	className?: string;
}

interface SingleProps extends BaseProps {
	multiple?: false;
	value?: string;
	onChange?: (value: string) => void;
}

interface MultiProps extends BaseProps {
	multiple: true;
	value?: string[];
	onChange?: (value: string[]) => void;
}

type SearchableSelectProps = SingleProps | MultiProps;

function isMulti(props: SearchableSelectProps): props is MultiProps {
	return props.multiple === true;
}

function useFilteredOptions(options: SearchableOption[], search: string) {
	return useMemo(() => {
		const query = search.trim().toLowerCase();
		const filtered = query ? options.filter((option) => option.label.toLowerCase().includes(query)) : options;
		const groups = new Map<string, SearchableOption[]>();
		for (const option of filtered) {
			const key = option.group ?? "";
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(option);
		}
		return Array.from(groups.entries()).filter(([, items]) => items.length > 0);
	}, [options, search]);
}

/** 채널·역할 선택 등에 쓰이는 검색 가능 셀렉트 — 단일/다중과 그룹을 지원해요. */
export function SearchableSelect(props: SearchableSelectProps) {
	const {
		options,
		placeholder = "선택해 주세요",
		searchable = false,
		searchPlaceholder = "검색…",
		disabled = false,
		className = "",
	} = props;

	const isMultiple = isMulti(props);
	// 빈 문자열은 "선택 안 됨"으로 취급해요 — ""가 그대로 선택값이 되면 트리거에 placeholder 대신 빈 라벨이 렌더링돼요
	const selectedValues = useMemo(
		() => (isMultiple ? (props.value ?? []) : props.value ? [props.value] : []),
		[isMultiple, props.value],
	);

	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const listboxId = useId();

	const grouped = useFilteredOptions(options, search);

	useEffect(() => {
		if (!open) {
			setSearch("");
			return;
		}
		if (searchable) {
			const id = window.setTimeout(() => searchRef.current?.focus(), 50);
			return () => window.clearTimeout(id);
		}
	}, [open, searchable]);

	const handleValueChange = (next: string | string[] | null) => {
		if (isMultiple) {
			const array = Array.isArray(next) ? next : next !== null ? [next] : [];
			props.onChange?.(array);
		} else {
			const value = Array.isArray(next) ? next[0] ?? "" : next ?? "";
			props.onChange?.(value);
		}
	};

	const displayLabel = useMemo(() => {
		if (selectedValues.length === 0) return null;
		// 다중 선택은 트리거에 개수를 세지 않고 아래 태그 칩으로 실제 선택을 보여줘요
		if (isMultiple) return null;
		const selected = options.find((option) => option.value === selectedValues[0]);
		return selected ? (
			<span className="inline-flex items-center gap-1.5">
				{selected.icon}
				{selected.label}
			</span>
		) : (
			selectedValues[0]
		);
	}, [selectedValues, options, isMultiple]);

	const selectedOptions = useMemo(
		() =>
			selectedValues
				.map((value) => options.find((item) => item.value === value))
				.filter((item): item is SearchableOption => item !== undefined),
		[selectedValues, options],
	);

	const removeSelectedValue = (valueToRemove: string) => {
		if (disabled) return;
		handleValueChange(selectedValues.filter((item) => item !== valueToRemove));
	};

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

	return (
		<SelectPrimitive.Root
			value={props.value as string | string[] | undefined}
			multiple={isMultiple}
			onValueChange={handleValueChange}
			open={open}
			onOpenChange={setOpen}
			disabled={disabled}
			modal={false}
		>
			<SelectPrimitive.Trigger
				aria-controls={listboxId}
				className={cn(
					"flex h-auto min-h-9 w-full cursor-pointer items-center justify-between gap-2 rounded-control border-0 bg-input py-1.5 pl-3 pr-2.5 text-left text-sm font-medium text-foreground shadow-control-boundary transition-colors duration-fast outline-none select-none hover:bg-surface-3",
					"focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
					className,
				)}
			>
				{isMultiple ? (
					selectedOptions.length > 0 ? (
						<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5">
							{selectedOptions.map((option) => (
								<span
									key={option.value}
									className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary-control/20 bg-primary-control/10 px-2.5 py-0.5 text-xs font-bold text-primary-text"
								>
									{option.icon}
									<span className="max-w-[12rem] truncate">{option.label}</span>
									<span
										role="button"
										tabIndex={disabled ? -1 : 0}
										onPointerDown={(event) => {
											event.stopPropagation();
										}}
										onClick={(event) => {
											event.stopPropagation();
											event.preventDefault();
											removeSelectedValue(option.value);
										}}
										onKeyDown={(event) => {
											if (event.key === "Enter" || event.key === " ") {
												event.stopPropagation();
												event.preventDefault();
												removeSelectedValue(option.value);
											}
										}}
										className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full transition-colors duration-fast hover:bg-primary-control/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:inset-y-[min(0px,calc((100%-44px)/2))] after:inset-x-[min(0px,calc((100%-24px)/2))]"
										aria-label={`${option.label} 제거`}
									>
										<X className="h-2.5 w-2.5" aria-hidden />
									</span>
								</span>
							))}
						</span>
					) : (
						<span className="font-normal text-muted-foreground">{placeholder}</span>
					)
				) : (
					<span className={cn("min-w-0 flex-1 truncate", displayLabel ? "text-foreground" : "font-normal text-muted-foreground")}>
						{displayLabel ?? placeholder}
					</span>
				)}
				<SelectPrimitive.Icon render={<ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-fast", open && "rotate-180")} />} />
			</SelectPrimitive.Trigger>

			<SelectPrimitive.Portal>
				<SelectPrimitive.Positioner align="start" side="bottom" sideOffset={6} alignItemWithTrigger={false} className="isolate z-(--z-overlay) outline-none">
					<SelectPrimitive.Popup
						id={listboxId}
						className="pop-in max-h-(--available-height) w-(--anchor-width) min-w-44 origin-(--transform-origin) overflow-hidden rounded-menu border border-border-subtle bg-popover text-popover-foreground shadow-2xl outline-none"
					>
						{searchable && (
							<div className="border-b border-border/50 p-2.5">
								<div className="relative">
									<Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
									<Input
										ref={searchRef}
										value={search}
										onChange={(event) => setSearch(event.target.value)}
										placeholder={searchPlaceholder}
										className="h-8 pl-8 pr-7 text-xs"
										aria-label="검색"
									/>
									{search ? (
										<button
											type="button"
											onClick={() => setSearch("")}
											aria-label="검색어 지우기"
											className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
										>
											<X className="size-3.5" />
										</button>
									) : null}
								</div>
							</div>
						)}
						<SelectPrimitive.List className="max-h-60 space-y-0.5 overflow-y-auto p-1.5">
							{grouped.length === 0 && (
								<div className="flex flex-col items-center justify-center gap-1 py-6 text-center text-xs text-muted-foreground">
									<p>검색 결과가 없어요.</p>
								</div>
							)}
							{grouped.map(([groupName, items]) => (
								<SelectPrimitive.Group key={groupName} className="space-y-0.5 py-0.5">
									{groupName && (
										<SelectPrimitive.GroupLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">
											{groupName}
										</SelectPrimitive.GroupLabel>
									)}
									{items.map((option) => {
										const selected = selectedSet.has(option.value);
										return (
											<SelectPrimitive.Item
												key={option.value}
												value={option.value}
												disabled={option.disabled}
												className={cn(
													"relative flex cursor-pointer items-center gap-2 rounded-control py-1.5 pr-8 pl-2.5 text-sm outline-hidden select-none transition-colors hover:bg-surface-2 focus:bg-surface-2 data-highlighted:bg-surface-2",
													selected && "bg-primary-control/15 font-semibold text-primary-text",
													option.disabled && "pointer-events-none opacity-50",
												)}
											>
												{option.icon}
												<span className="flex-1 truncate">{option.label}</span>
												<span className="pointer-events-none absolute right-2.5 flex size-4 items-center justify-center text-primary-text">
													{selected && <Check className="size-4" />}
												</span>
											</SelectPrimitive.Item>
										);
									})}
								</SelectPrimitive.Group>
							))}
						</SelectPrimitive.List>
					</SelectPrimitive.Popup>
				</SelectPrimitive.Positioner>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	);
}
