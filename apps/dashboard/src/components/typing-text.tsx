"use client";

import { useEffect, useState } from "react";
import { m } from "framer-motion";

import { decomposeHangul } from "@/lib/hangul";

/**
 * 자소 분해 타이핑 애니메이션.
 * `fit` — 보이지 않는 예약 레이어가 가장 긴 후보의 폭을 항상 차지해서
 * 줄바꿈·레이아웃 점프를 막되, 실제 텍스트는 정렬 컨텍스트를 그대로 따라 자연스러워요.
 */
export function TypingText({
	texts,
	speed = 150,
	delay = 2000,
	className = "",
	fit = false,
}: {
	texts: string[];
	speed?: number;
	delay?: number;
	className?: string;
	fit?: boolean;
}) {
	const [displayText, setDisplayText] = useState("");
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isDeleting, setIsDeleting] = useState(false);
	const [charIndex, setCharIndex] = useState(0);
	const [stateIndex, setStateIndex] = useState(0);

	const longest = texts.reduce((a, b) => (b.length > a.length ? b : a), "");

	useEffect(() => {
		let timeout: NodeJS.Timeout;
		const currentFullText = texts[currentIndex % texts.length];

		const tick = () => {
			if (!isDeleting) {
				if (charIndex < currentFullText.length) {
					const char = currentFullText[charIndex];
					const states = decomposeHangul(char);

					if (stateIndex < states.length) {
						const baseText = currentFullText.slice(0, charIndex);
						setDisplayText(baseText + states[stateIndex]);
						setStateIndex(prev => prev + 1);
						timeout = setTimeout(tick, speed / 2);
					} else {
						setCharIndex(prev => prev + 1);
						setStateIndex(0);
						timeout = setTimeout(tick, speed);
					}
				} else {
					timeout = setTimeout(() => setIsDeleting(true), delay);
				}
			} else {
				if (displayText.length > 0) {
					setDisplayText(prev => prev.slice(0, -1));
					timeout = setTimeout(tick, speed / 3);
				} else {
					setIsDeleting(false);
					setCharIndex(0);
					setStateIndex(0);
					setCurrentIndex(prev => prev + 1);
					timeout = setTimeout(tick, 500);
				}
			}
		};

		timeout = setTimeout(tick, speed);
		return () => clearTimeout(timeout);
	}, [displayText, isDeleting, currentIndex, charIndex, stateIndex, texts, speed, delay]);

	const content = (
		<>
			{displayText}
			<m.span
				animate={{ opacity: [1, 0] }}
				transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
				className="-ml-px inline-block h-[0.9em] w-[2px] bg-primary align-baseline"
				aria-hidden
			/>
		</>
	);

	return (
		<span className={className}>
			{fit ? (
				<span className="relative inline-block whitespace-nowrap">
					{/* 폭 예약 — 가장 긴 후보를 보이지 않게 렌더 */}
					<span aria-hidden className="invisible">
						{longest}
					</span>
					{/* 실제 텍스트 — 예약 레이어 위에 겹쳐 정렬은 컨텍스트를 따름 */}
					<span className="absolute inset-0">{content}</span>
				</span>
			) : (
				content
			)}
		</span>
	);
}