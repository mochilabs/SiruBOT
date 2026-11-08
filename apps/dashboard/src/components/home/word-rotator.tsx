"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, m } from "framer-motion";

// 헤드라인 회전 단어 — "음악부터 AI까지, ___ 시루봇 하나면 돼요"의 빈칸에 아래에서 위로 밀려 올라와 교체돼요
export const ROTATING_WORDS = ['서버에 필요한 모든 걸', 'Discord 안에서, 웹에서', '게임부터 서버 꾸미기까지'] as const;
const ROTATE_INTERVAL_MS = 2600;

/**
 * 헤드라인 단어 회전기 — 현재 단어가 위로 빠지면서 다음 단어가 아래에서 올라와요.
 * 폭 sizer는 "교체 대상(다음) 단어" 기준으로 즉시 전환해요: 이전 단어 폭을 유지하면
 * 더 긴 단어가 진입하는 동안 overflow-hidden에 잘려요.
 * 마스크 하단 패딩은 자모 받침 클리핑 방지용이에요.
 */
export function WordRotator() {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => setIndex((prev) => (prev + 1) % ROTATING_WORDS.length), ROTATE_INTERVAL_MS);
		return () => clearInterval(timer);
	}, []);

	return (
		<span className="relative inline-block overflow-hidden whitespace-pre pb-[0.12em] -mb-[0.12em] align-bottom">
			<span className="invisible" aria-hidden>
				{ROTATING_WORDS[index]}
			</span>
			<AnimatePresence initial={false}>
				<m.span
					key={ROTATING_WORDS[index]}
					className="absolute inset-0 flex justify-center lg:justify-start"
					initial={{ y: "110%", opacity: 0 }}
					animate={{ y: "0%", opacity: 1 }}
					exit={{ y: "-110%", opacity: 0 }}
					transition={{ type: "spring", stiffness: 260, damping: 32 }}
				>
					{ROTATING_WORDS[index]}
				</m.span>
			</AnimatePresence>
		</span>
	);
}

