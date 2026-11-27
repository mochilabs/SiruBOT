"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CONFIRM_TIMEOUT_MS = 4000;

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
