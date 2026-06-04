"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";

import { Portal, usePopoverCoords } from "./portal";

/* ─────────────────────────── types ─────────────────────────── */

export interface DropdownItem {
	key: string;
	label: string;
	icon?: React.ReactNode;
	shortcut?: string;
	disabled?: boolean;
	danger?: boolean;
	onClick?: () => void;
}

export interface DropdownGroup {
	label?: string;
	items: DropdownItem[];
}

interface DropdownProps {
	trigger: React.ReactNode;
	groups: DropdownGroup[];
	align?: "left" | "right";
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function Dropdown({
	trigger,
	groups,
	align = "left",
	className = "",
}: DropdownProps) {
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const coords = usePopoverCoords(triggerRef, open);

	// Flatten items for keyboard navigation
	const allItems = groups.flatMap((g) => g.items).filter((i) => !i.disabled);

	const close = useCallback(() => {
		setOpen(false);
		setActiveIndex(-1);
	}, []);

	// Close on click outside
	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (!containerRef.current?.contains(e.target as Node)) close();
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open, close]);

	// Close on Escape
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") close();
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, close]);

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
				setActiveIndex((prev) => (prev + 1) % allItems.length);
				break;
			case "ArrowUp":
				e.preventDefault();
				setActiveIndex((prev) => (prev - 1 + allItems.length) % allItems.length);
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				if (activeIndex >= 0 && allItems[activeIndex]) {
					allItems[activeIndex].onClick?.();
					close();
				}
				break;
			case "Home":
				e.preventDefault();
				setActiveIndex(0);
				break;
			case "End":
				e.preventDefault();
				setActiveIndex(allItems.length - 1);
				break;
		}
	};

	// Scroll active item into view
	useEffect(() => {
		if (activeIndex < 0 || !menuRef.current) return;
		const items = menuRef.current.querySelectorAll('[role="menuitem"]');
		items[activeIndex]?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	let flatIndex = -1;

	return (
		<div ref={containerRef} className={`relative inline-block ${className}`}>
			{/* Trigger */}
			<div
				ref={triggerRef}
				role="button"
				tabIndex={0}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => (open ? close() : setOpen(true))}
				onKeyDown={handleKeyDown}
				className="cursor-pointer"
			>
				{trigger}
			</div>

			{/* Menu */}
			<AnimatePresence>
				{open && (
					<Portal>
						{/* Backdrop */}
						<div
							className="fixed inset-0 z-[190] cursor-default"
							onClick={close}
						/>
						<m.div
							ref={menuRef}
							role="menu"
							initial={{ opacity: 0, scale: 0.95, y: -4 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -4 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className="fixed z-[200] mt-2 min-w-[200px] glass-panel p-1.5 shadow-2xl"
							style={{
								top: coords.top,
								left: align === "right" ? undefined : coords.left,
								right: align === "right" ? coords.rightSpace : undefined,
							}}
						>
							{groups.map((group, gi) => (
								<div key={gi}>
									{gi > 0 && (
										<div className="my-1.5 h-px bg-border/40" role="separator" />
									)}
									{group.label && (
										<p className="px-3 py-1.5 text-xs font-black uppercase tracking-widest text-muted-foreground/40">
											{group.label}
										</p>
									)}
									{group.items.map((item) => {
										const idx = item.disabled ? -1 : ++flatIndex;
										const isActive = idx === activeIndex;

										return (
											<button
												key={item.key}
												role="menuitem"
												type="button"
												disabled={item.disabled}
												tabIndex={-1}
												onClick={() => {
													if (item.disabled) return;
													item.onClick?.();
													close();
												}}
												onMouseEnter={() => {
													if (!item.disabled) setActiveIndex(idx);
												}}
												className={`
													w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors cursor-pointer
													${item.disabled ? "opacity-40 pointer-events-none" : ""}
													${item.danger ? "text-red-500" : "text-foreground"}
													${isActive && !item.disabled ? "bg-accent/80" : "hover:bg-accent/50"}
												`}
											>
												{item.icon && (
													<span className="shrink-0 h-4 w-4 flex items-center justify-center">
														{item.icon}
													</span>
												)}
												<span className="flex-1 text-left truncate">{item.label}</span>
												{item.shortcut && (
													<kbd className="text-xs font-bold text-muted-foreground/50 tracking-wider">
														{item.shortcut}
													</kbd>
												)}
											</button>
										);
									})}
								</div>
							))}
						</m.div>
					</Portal>
				)}
			</AnimatePresence>
		</div>
	);
}
