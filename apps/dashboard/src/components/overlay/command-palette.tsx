"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Search } from "lucide-react";

import { Portal } from "./portal";

/* ─────────────────────────── types ─────────────────────────── */

export interface CommandItem {
	id: string;
	label: string;
	icon?: React.ReactNode;
	shortcut?: string;
	group?: string;
	onSelect: () => void;
}

interface CommandPaletteProps {
	open: boolean;
	onClose: () => void;
	items: CommandItem[];
	placeholder?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function CommandPalette({
	open,
	onClose,
	items,
	placeholder = "명령어 검색...",
}: CommandPaletteProps) {
	const [query, setQuery] = useState("");
	const [activeIndex, setActiveIndex] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Filter items with fuzzy matching
	const filtered = useMemo(() => {
		if (!query) return items;
		const q = query.toLowerCase();
		return items.filter((item) => item.label.toLowerCase().includes(q));
	}, [items, query]);

	// Group filtered items
	const groups = useMemo(() => {
		const map = new Map<string, CommandItem[]>();
		for (const item of filtered) {
			const g = item.group ?? "";
			if (!map.has(g)) map.set(g, []);
			map.get(g)!.push(item);
		}
		return map;
	}, [filtered]);

	// Reset state on open
	useEffect(() => {
		if (open) {
			setQuery("");
			setActiveIndex(0);
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	// Global ⌘K / Ctrl+K handler
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				if (open) onClose();
				// Opening is handled externally
			}
			if (e.key === "Escape" && open) {
				e.preventDefault();
				onClose();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [open, onClose]);

	// Body scroll lock
	useEffect(() => {
		if (!open) return;
		
		const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
		
		document.body.style.overflow = "hidden";
		document.body.style.paddingRight = `${scrollbarWidth}px`;
		
		return () => {
			document.body.style.overflow = "";
			document.body.style.paddingRight = "";
		};
	}, [open]);

	const select = useCallback(
		(item: CommandItem) => {
			item.onSelect();
			onClose();
		},
		[onClose],
	);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActiveIndex((p) => Math.min(p + 1, filtered.length - 1));
				break;
			case "ArrowUp":
				e.preventDefault();
				setActiveIndex((p) => Math.max(p - 1, 0));
				break;
			case "Enter":
				e.preventDefault();
				if (filtered[activeIndex]) select(filtered[activeIndex]);
				break;
		}
	};

	// Scroll active into view
	useEffect(() => {
		if (!listRef.current) return;
		const items = listRef.current.querySelectorAll('[role="option"]');
		items[activeIndex]?.scrollIntoView({ block: "nearest" });
	}, [activeIndex]);

	let flatIndex = -1;

	return (
		<Portal>
			<AnimatePresence>
				{open && (
					<div className="fixed inset-0 z-[200] flex items-start justify-center pt-[20vh] p-4">
						{/* Backdrop */}
						<m.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.15 }}
							className="absolute inset-0 bg-black/60"
							onClick={onClose}
							aria-hidden
						/>

						{/* Palette */}
						<m.div
							role="dialog"
							aria-modal="true"
							aria-label="명령어 팔레트"
							initial={{ opacity: 0, scale: 0.95, y: -8 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.95, y: -8 }}
							transition={{ type: "spring", stiffness: 500, damping: 35 }}
							className="relative z-10 w-full max-w-xl glass-panel overflow-hidden shadow-2xl"
						>
							{/* Search input */}
							<div className="flex items-center gap-3 px-5 border-b border-border/40">
								<Search className="h-5 w-5 text-muted-foreground shrink-0" />
								<input
									ref={inputRef}
									type="text"
									value={query}
									onChange={(e) => {
										setQuery(e.target.value);
										setActiveIndex(0);
									}}
									onKeyDown={handleKeyDown}
									placeholder={placeholder}
									className="flex-1 h-14 bg-transparent text-base text-foreground placeholder:text-muted-foreground/40 font-medium focus:outline-none"
								/>
								<kbd className="hidden sm:inline-flex px-2 py-1 rounded-lg bg-foreground/5 text-xs font-bold text-muted-foreground/50 tracking-wider border border-border/40">
									ESC
								</kbd>
							</div>

							{/* Results */}
							<div
								ref={listRef}
								role="listbox"
								className="max-h-80 overflow-y-auto p-2"
							>
								{filtered.length === 0 && (
									<p className="py-8 text-center text-sm text-muted-foreground/60 font-medium">
										결과가 없어요
									</p>
								)}

								{Array.from(groups.entries()).map(([groupName, groupItems], gi) => (
									<div key={groupName || gi}>
										{groupName && (
											<p className="px-3 py-2 text-xs font-black uppercase tracking-widest text-muted-foreground/40">
												{groupName}
											</p>
										)}
										{groupItems.map((item) => {
											flatIndex++;
											const isActive = flatIndex === activeIndex;

											return (
												<button
													key={item.id}
													type="button"
													role="option"
													aria-selected={isActive}
													tabIndex={-1}
													onClick={() => select(item)}
													onMouseEnter={() => setActiveIndex(flatIndex)}
													className={`
														w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer
														${isActive ? "bg-accent/80" : "hover:bg-accent/50"}
													`}
												>
													{item.icon && (
														<span className="shrink-0 h-5 w-5 flex items-center justify-center text-muted-foreground">
															{item.icon}
														</span>
													)}
													<span className="flex-1 text-left text-foreground">{item.label}</span>
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
							</div>

							{/* Footer hint */}
							<div className="px-4 py-2.5 border-t border-border/40 flex items-center gap-4 text-xs font-bold text-muted-foreground/40 tracking-wider">
								<span>↑↓ 이동</span>
								<span>↵ 선택</span>
								<span>ESC 닫기</span>
							</div>
						</m.div>
					</div>
				)}
			</AnimatePresence>
		</Portal>
	);
}
