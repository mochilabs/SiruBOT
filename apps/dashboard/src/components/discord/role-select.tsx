"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { Portal, usePopoverCoords } from "../overlay/portal";

/* ─────────────────────────── types ─────────────────────────── */

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

/* ─────────────────────────── helpers ─────────────────────────── */

function roleColorHex(color: number): string | null {
	if (color === 0) return null;
	return `#${color.toString(16).padStart(6, "0")}`;
}

/* ─────────────────────────── component ─────────────────────────── */

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
			{/* Trigger */}
			<button
				ref={triggerRef}
				type="button"
				disabled={disabled}
				onClick={() => setOpen(!open)}
				className={`
					w-full min-h-[44px] px-4 py-2 flex items-center justify-between gap-2
					glass-panel text-sm font-medium transition-all duration-300 cursor-pointer
					${disabled ? "opacity-50 pointer-events-none" : "hover:border-primary/30"}
					${open ? "ring-2 ring-primary/20 border-primary/30" : ""}
				`}
			>
				<span className={value.length > 0 ? "text-foreground" : "text-muted-foreground/50"}>
					{value.length > 0 ? `${value.length}개 역할 선택됨` : placeholder}
				</span>
				<ChevronDown
					className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{/* Selected pills */}
			{selectedRoles.length > 0 && (
				<div className="flex flex-wrap gap-1.5 mt-2">
					{selectedRoles.map((role) => {
						const hex = roleColorHex(role.color);
						return (
							<span
								key={role.id}
								className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold border"
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
								{role.name}
								<button
									type="button"
									onClick={() => toggle(role.id)}
									className="p-0.5 rounded-full hover:opacity-70 transition-opacity cursor-pointer"
									aria-label={`${role.name} 제거`}
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
							className="fixed z-[200] mt-2 glass-panel p-1.5 shadow-2xl max-h-64 overflow-y-auto"
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
									className="w-full h-9 pl-9 pr-3 bg-transparent border-b border-border/40 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
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
											w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer
											hover:bg-accent/50
										`}
									>
										<span
											className="h-3 w-3 rounded-full shrink-0 border border-white/10"
											style={{ backgroundColor: hex ?? "var(--muted-foreground)" }}
										/>
										<span className="flex-1 text-left text-foreground truncate">
											{role.name}
										</span>
										{isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
									</button>
								);
							})}

							{filtered.length === 0 && (
								<p className="py-6 text-center text-sm text-muted-foreground/60 font-medium">
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
