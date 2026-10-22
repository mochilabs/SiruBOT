"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** 실수 방지 2클릭 삭제 — 첫 클릭으로 무장, 4초 안에 다시 클릭해야 실행돼요 */
const CONFIRM_TIMEOUT_MS = 4000;

/**
 * 2단계 삭제 확인 훅 — 같은 길드의 여러 항목에서 각각 무장 상태를 들고 있어요.
 * `request(id)`를 한 번 더 부르면 armed id와 같아 실행 대상이 돼요(반환 true),
 * 다르면 해당 id로 무장만 하고 false를 돌려줘요. 4초가 지나면 자동 해제돼요.
 */
export function useConfirmDelete(): {
	armedId: string | null;
	request: (id: string) => boolean;
	reset: () => void;
} {
	const [armedId, setArmedId] = useState<string | null>(null);
	const timerRef = useRef<number | null>(null);

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	useEffect(() => clearTimer, [clearTimer]);

	const request = useCallback(
		(id: string): boolean => {
			if (armedId !== id) {
				clearTimer();
				setArmedId(id);
				timerRef.current = window.setTimeout(() => setArmedId(null), CONFIRM_TIMEOUT_MS);
				return false;
			}
			clearTimer();
			setArmedId(null);
			return true;
		},
		[armedId, clearTimer],
	);

	const reset = useCallback(() => {
		clearTimer();
		setArmedId(null);
	}, [clearTimer]);

	return { armedId, request, reset };
}
