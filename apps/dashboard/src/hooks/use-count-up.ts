"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

interface CountUpOptions {
	/** 최종 목표 값 */
	end: number;
	/** 시작 값 (기본 0) */
	start?: number;
	/** 지속 시간 ms (기본 1200) */
	durationMs?: number;
}

/**
 * 뷰포트에 들어오면 0(또는 start)부터 end까지 카운트업하는 숫자를 반환한다.
 * - `prefers-reduced-motion: reduce` 환경에서는 애니메이션 없이 즉시 end 값 표시
 * - 진행 중 `end` 값이 바뀌면(예: 기간 필터 변경) 현재 표시 값부터 이어서 애니메이션
 * - 훅이 반환하는 `ref`를 숫자 요소에 붙여야 뷰포트 진입을 감지한다
 */
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