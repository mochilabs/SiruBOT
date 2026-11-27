"use client";

import { useEffect, useState } from "react";
import { m, useReducedMotion } from "framer-motion";

import { motionSlow } from "@/components/motion/durations";
import { decomposeHangul } from "@/lib/hangul";

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
	const shouldReduce = useReducedMotion();
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
				animate={shouldReduce ? undefined : { opacity: [1, 0] }}
				transition={{ duration: motionSlow, repeat: Infinity, ease: "linear" }}
				className="-ml-px inline-block h-[0.9em] w-0.5 bg-primary-control align-baseline"
				aria-hidden
			/>
		</>
	);

	return (
		<span className={className}>
			{fit ? (
				<span className="relative inline-block whitespace-nowrap">
					<span aria-hidden className="invisible">
						{longest}
					</span>
					<span className="absolute inset-0">{content}</span>
				</span>
			) : (
				content
			)}
		</span>
	);
}