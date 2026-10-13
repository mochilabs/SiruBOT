"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

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

/** 채널 선택에 쓰이는 검색 가능 셀렉트 — 단일/다중과 그룹을 지원해요. */
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
	const selectedValues = useMemo(
		() => (isMultiple ? (props.value ?? []) : props.value !== undefined ? [props.value] : []),
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
		if (isMultiple) {
			return `${selectedValues.length}개 선택됨`;
		}
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

	const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);

	return (
		<SelectPrimitive.Root
			value={props.value as string | string[] | undefined}
			multiple={isMultiple}
			onValueChange={handleValueChange}
			open={open}
			onOpenChange={setOpen}
			disabled={disabled}
		>
			<SelectPrimitive.Trigger
				aria-controls={listboxId}
				className={cn(
					"flex h-11 w-full items-center justify-between gap-2 rounded-control border-0 bg-input shadow-control-boundary px-3 text-left text-sm font-medium outline-none transition-colors",
					"focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
			>
				<span className={displayLabel ? "text-foreground" : "text-muted-foreground"}>{displayLabel ?? placeholder}</span>
				<SelectPrimitive.Icon render={<ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-fast", open && "rotate-180")} />} />
			</SelectPrimitive.Trigger>

			<SelectPrimitive.Portal>
				<SelectPrimitive.Positioner align="start" side="bottom" sideOffset={4} className="z-50">
					<SelectPrimitive.Popup
						id={listboxId}
						className="max-h-(--available-height) w-(--anchor-width) min-w-36 overflow-hidden rounded-menu border-0 bg-popover text-popover-foreground shadow-2xl"
					>
						{searchable && (
							<div className="border-b border-border p-2">
								<Input
									ref={searchRef}
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder={searchPlaceholder}
									className="h-8 bg-input/50"
									aria-label="검색"
								/>
							</div>
						)}
						<SelectPrimitive.List className="max-h-60 overflow-y-auto p-1">
							{grouped.length === 0 && (
								<div className="px-3 py-2 text-sm text-muted-foreground">검색 결과가 없어요.</div>
							)}
							{grouped.map(([groupName, items]) => (
								<SelectPrimitive.Group key={groupName}>
									{groupName && (
										<SelectPrimitive.GroupLabel className="px-2 py-1 text-xs font-medium text-muted-foreground">
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
													"relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground",
													option.disabled && "pointer-events-none opacity-50",
												)}
											>
												{option.icon}
												<span className="flex-1 truncate">{option.label}</span>
												<span className="flex size-4 items-center justify-center">
													{selected && <Check className="h-4 w-4" />}
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
