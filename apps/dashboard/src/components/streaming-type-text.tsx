"use client";

import { useEffect, useRef, useState } from "react";

import { decomposeHangul } from "@/lib/hangul";

export function StreamingTypeText({
	text,
	speed = 45,
	className = "",
	cursorClassName = "bg-discord-text",
	showCursor = true,
	onComplete,
}: {
	text: string;
	speed?: number;
	className?: string;
	cursorClassName?: string;
	showCursor?: boolean;
	onComplete?: () => void;
}) {
	const [visibleCount, setVisibleCount] = useState(0);
	const [composing, setComposing] = useState(0);
	const finishedRef = useRef(false);
	const onCompleteRef = useRef(onComplete);
	onCompleteRef.current = onComplete;

	useEffect(() => {
		setVisibleCount(0);
		setComposing(0);
		finishedRef.current = false;
	}, [text]);

	useEffect(() => {
		if (finishedRef.current) return undefined;
		if (visibleCount >= text.length) {
			finishedRef.current = true;
			onCompleteRef.current?.();
			return undefined;
		}

		const states = decomposeHangul(text[visibleCount]);
		const isComposing = composing < states.length - 1;

		const timer = setTimeout(
			() => {
				if (isComposing) {
					setComposing((prev) => prev + 1);
				} else {
					setVisibleCount((prev) => prev + 1);
					setComposing(0);
				}
			},
			isComposing ? speed / 2 : speed,
		);

		return () => clearTimeout(timer);
	}, [visibleCount, composing, text, speed]);

	let rendered = text.slice(0, visibleCount);
	if (visibleCount < text.length) {
		const states = decomposeHangul(text[visibleCount]);
		if (composing > 0 && composing < states.length) {
			rendered += states[composing - 1];
		}
	}

	return (
		<span className={className}>
			{rendered}
			{showCursor && (
				<span
					className={`inline-block h-[0.9em] w-0.5 align-baseline ${cursorClassName}`}
					style={{ animation: "cursor-blink 0.8s linear infinite", marginLeft: "1px" }}
					aria-hidden
				/>
			)}
		</span>
	);
}