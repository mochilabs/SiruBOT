"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";

import { motionSlow } from "@/components/motion/durations";

export const ROTATING_WORDS = ['서버에 필요한 모든 걸', '한국어 커뮤니티에 맞게', '게임부터 서버 꾸미기까지'] as const;
const ROTATE_INTERVAL_MS = 2600;

export function WordRotator({ running = true }: { running?: boolean }) {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (!running) return undefined;
		const timer = setInterval(() => setIndex((prev) => (prev + 1) % ROTATING_WORDS.length), ROTATE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [running]);

	return (
		<>
			<span className="sr-only">{ROTATING_WORDS[0]}</span>
			<span aria-hidden className="relative inline-block overflow-hidden whitespace-pre pb-[0.12em] -mb-[0.12em] align-bottom">
			<span className="invisible">
				{ROTATING_WORDS[index]}
			</span>
			<AnimatePresence initial={false}>
				<m.span
					key={ROTATING_WORDS[index]}
					className="absolute inset-0 flex justify-start"
					initial={{ y: "110%", opacity: 0 }}
					animate={{ y: "0%", opacity: 1 }}
					exit={{ y: "-110%", opacity: 0 }}
					transition={{ duration: motionSlow, ease: [0.23, 1, 0.32, 1] }}
				>
					{ROTATING_WORDS[index]}
				</m.span>
			</AnimatePresence>
			</span>
		</>
	);
}

