"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

interface CountUpOptions {
	end: number;
	start?: number;
	durationMs?: number;
}

export function useCountUp({ end, start = 0, durationMs = 1200 }: CountUpOptions): {
	ref: (node?: Element | null) => void;
	value: number;
	inView: boolean;
} {
	const { ref, inView } = useInView({ triggerOnce: true, threshold: 0.4 });
	const [value, setValue] = useState(start);
	const currentRef = useRef(start);

	useEffect(() => {
		if (!inView) return;
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			currentRef.current = end;
			setValue(end);
			return;
		}

		let raf = 0;
		const t0 = performance.now();
		const from = currentRef.current;

		const step = (now: number) => {
			const progress = Math.min((now - t0) / durationMs, 1);
			const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
			const next = from + (end - from) * eased;
			currentRef.current = next;
			setValue(next);
			if (progress < 1) raf = requestAnimationFrame(step);
		};

		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [inView, end, start, durationMs]);

	return { ref, value, inView };
}