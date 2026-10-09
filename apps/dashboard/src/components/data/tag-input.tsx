"use client";

import { useCallback, useRef, useState } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/primitives/button";

/* ─────────────────────────── types ─────────────────────────── */

interface TagInputProps {
	value?: string[];
	onChange?: (tags: string[]) => void;
	placeholder?: string;
	maxTags?: number;
	disabled?: boolean;
	allowDuplicates?: boolean;
	validate?: (tag: string) => boolean;
	className?: string;
}

/* ─────────────────────────── component ─────────────────────────── */

export function TagInput({
	value = [],
	onChange,
	placeholder = "입력 후 Enter",
	maxTags = Infinity,
	disabled = false,
	allowDuplicates = false,
	validate,
	className = "",
}: TagInputProps) {
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const addTag = useCallback(
		(raw: string) => {
			const tag = raw.trim();
			if (!tag) return;
			if (!allowDuplicates && value.includes(tag)) return;
			if (value.length >= maxTags) return;
			if (validate && !validate(tag)) return;
			onChange?.([...value, tag]);
			setInput("");
		},
		[value, onChange, allowDuplicates, maxTags, validate],
	);

	const removeTag = useCallback(
		(index: number) => {
			onChange?.(value.filter((_, i) => i !== index));
		},
		[value, onChange],
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" || e.key === ",") {
			e.preventDefault();
			addTag(input);
		} else if (e.key === "Backspace" && !input && value.length > 0) {
			removeTag(value.length - 1);
		}
	};

	return (
		<div
			onClick={() => inputRef.current?.focus()}
			className={`
				rounded-control border border-border bg-input flex flex-wrap items-center gap-2 px-3 py-2.5 min-h-[44px]
				transition-all duration-base cursor-text
				focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30
				${disabled ? "opacity-50 pointer-events-none" : ""}
				${className}
			`}
		>
			{/* Tags */}
			{value.map((tag, i) => (
				<span
					key={`${tag}-${i}`}
					className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary-text select-none"
				>
					{tag}
					{!disabled && (
						<Button
							variant="icon"
							size="sm"
							onClick={(e) => {
								e.stopPropagation();
								removeTag(i);
							}}
							className="h-3.5 w-3.5 rounded-full border-transparent bg-transparent p-0.5 hover:bg-primary/20"
							aria-label={`${tag} 제거`}
						>
							<X className="h-2.5 w-2.5" />
						</Button>
					)}
				</span>
			))}

			{/* Input */}
			{value.length < maxTags && (
				<input
					ref={inputRef}
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={handleKeyDown}
					onBlur={() => {
						if (input.trim()) addTag(input);
					}}
					placeholder={value.length === 0 ? placeholder : ""}
					disabled={disabled}
					className="flex-1 min-w-[80px] bg-transparent text-sm text-foreground placeholder:text-muted-foreground font-medium focus:outline-none"
				/>
			)}

			{/* Count */}
			{maxTags < Infinity && (
				<span className="ml-auto text-xs font-bold text-muted-foreground tabular-nums shrink-0">
					{value.length}/{maxTags}
				</span>
			)}
		</div>
	);
}
