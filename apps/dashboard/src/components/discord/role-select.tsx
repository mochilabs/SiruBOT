"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Portal, usePopoverCoords } from "../overlay/portal";

export interface DiscordRole {
	id: string;
	name: string;
	color: number;
	position: number;
}

interface RoleSelectProps {
	roles: DiscordRole[];
	value?: string[];
	onChange?: (roleIds: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}

function roleColorHex(color: number): string | null {
	if (color === 0) return null;
	return `#${color.toString(16).padStart(6, "0")}`;
}

export function RoleSelect({
	roles,
	value = [],
	onChange,
	placeholder = "역할을 선택해 주세요",
	disabled = false,
	className = "",
}: RoleSelectProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const coords = usePopoverCoords(triggerRef, open);

	const sorted = useMemo(
		() => [...roles].sort((a, b) => b.position - a.position),
		[roles],
	);

	const filtered = useMemo(
		() =>
			sorted.filter((r) =>
				r.name.toLowerCase().includes(search.toLowerCase()),
			),
		[sorted, search],
	);

	const toggle = useCallback(
		(id: string) => {
			const next = value.includes(id)
				? value.filter((v) => v !== id)
				: [...value, id];
			onChange?.(next);
		},
		[value, onChange],
	);

	// Click outside
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) {
				setOpen(false);
				setSearch("");
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	// Focus search
	useEffect(() => {
		if (open) setTimeout(() => searchRef.current?.focus(), 50);
	}, [open]);

	const selectedRoles = sorted.filter((r) => value.includes(r.id));

	return (
		<div ref={containerRef} className={`relative ${className}`}>
			{/* Trigger (선택된 역할 태그가 트리거 안쪽에 들어가요) */}
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				onClick={() => setOpen(!open)}
				className={`
					w-full min-h-9 px-3 py-1.5 flex items-center justify-between gap-2
					rounded-control border-0 bg-input shadow-control-boundary text-sm font-medium transition-all duration-base cursor-pointer
					${disabled ? "opacity-50 pointer-events-none" : ""}
					${open ? "ring-2 ring-ring" : ""}
				`}
			>
				{selectedRoles.length > 0 ? (
					<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-0.5 text-left">
						{selectedRoles.map((role) => {
							const hex = roleColorHex(role.color);
							return (
								<span
									key={role.id}
									className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border border-primary-control/20 bg-primary-control/10 text-primary-text"
									style={{
										borderColor: hex ? `${hex}40` : undefined,
										backgroundColor: hex ? `${hex}15` : undefined,
										color: hex ?? undefined,
									}}
								>
									<span
										className="h-2 w-2 rounded-full shrink-0"
										style={{ backgroundColor: hex ?? "var(--muted-foreground)" }}
									/>
									<span className="max-w-[12rem] truncate">{role.name}</span>
									<span
										role="button"
										tabIndex={disabled ? -1 : 0}
										onPointerDown={(e) => e.stopPropagation()}
										onClick={(e) => {
											e.stopPropagation();
											e.preventDefault();
											toggle(role.id);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.stopPropagation();
												e.preventDefault();
												toggle(role.id);
											}
										}}
										className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full p-0.5 hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
										aria-label={`${role.name} 제거`}
									>
										<X className="h-2.5 w-2.5" aria-hidden />
									</span>
								</span>
							);
						})}
					</span>
				) : (
					<span className="text-muted-foreground">{placeholder}</span>
				)}
				<ChevronDown
					className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-fast ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{/* Dropdown */}
			<AnimatePresence>
				{open && (
					<Portal>
						{/* Backdrop */}
						<div
							className="fixed inset-0 z-[190] cursor-default"
							onClick={() => {
								setOpen(false);
								setSearch("");
							}}
						/>
						<m.div
							initial={{ opacity: 0, scale: 0.95, y: -4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -4 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="fixed z-[200] mt-2 rounded-menu border-0 bg-popover p-1.5 shadow-2xl max-h-64 overflow-y-auto"
							style={{
								top: coords.top,
								left: coords.left,
								width: coords.width,
							}}
						>
							{/* Search */}
							<div className="relative mb-1.5">
								<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
								<input
									ref={searchRef}
									type="text"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="역할 검색..."
									aria-label="역할 검색"
									className="w-full h-9 rounded-control border-0 bg-input pl-9 pr-3 text-sm text-foreground shadow-control-boundary transition-control duration-fast outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
								/>
							</div>

							{/* Options */}
							{filtered.map((role) => {
								const isSelected = value.includes(role.id);
								const hex = roleColorHex(role.color);

								return (
									<button
										key={role.id}
										type="button"
										onClick={() => toggle(role.id)}
										className={`
											w-full flex items-center gap-3 px-3 py-2 rounded-menu text-sm font-medium transition-colors cursor-pointer
											hover:bg-accent
										`}
									>
										<span
											className="h-3 w-3 rounded-full shrink-0 border border-white/10"
											style={{ backgroundColor: hex ?? "var(--muted-foreground)" }}
										/>
										<span className="flex-1 text-left text-foreground truncate">
											{role.name}
										</span>
										{isSelected && <Check className="h-4 w-4 text-primary-text shrink-0" />}
									</button>
								);
							})}

							{filtered.length === 0 && (
								<p className="py-6 text-center text-sm text-muted-foreground font-medium">
									역할을 찾을 수 없어요
								</p>
							)}
						</m.div>
					</Portal>
				)}
			</AnimatePresence>
		</div>
	);
}
