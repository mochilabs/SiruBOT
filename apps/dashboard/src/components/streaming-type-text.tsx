"use client";

import { useEffect, useRef, useState } from "react";

import { decomposeHangul } from "@/lib/hangul";

/**
 * 한글 자소 분해 타이핑 스트리밍 — 봇 답변이 실제로 타이핑되는 애니메이션.
 * 완료 시 커서만 깜빡여요. `key`를 바꾸면 처음부터 재생돼요.
 */
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

	// 렌더: 완성된 글자들 + 현재 조합 중인 글자의 중간 상태
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
					className={`inline-block h-[0.9em] w-[2px] align-baseline ${cursorClassName}`}
					style={{ animation: "cursor-blink 0.8s linear infinite", marginLeft: "1px" }}
					aria-hidden
				/>
			)}
		</span>
	);
}