"use client";

import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface FeatureSwitcher {
	open: boolean;
	setOpen: (open: boolean) => void;
	headerPresent: boolean;
	registerHeader: () => () => void;
}

const FeatureSwitcherContext = createContext<FeatureSwitcher | null>(null);

export function FeatureSwitcherProvider({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const [headers, setHeaders] = useState(0);

	const registerHeader = useCallback(() => {
		setHeaders((n) => n + 1);
		return () => setHeaders((n) => Math.max(0, n - 1));
	}, []);

	const value = useMemo(
		() => ({ open, setOpen, headerPresent: headers > 0, registerHeader }),
		[open, headers, registerHeader],
	);

	return <FeatureSwitcherContext.Provider value={value}>{children}</FeatureSwitcherContext.Provider>;
}

export function useFeatureSwitcher(): FeatureSwitcher | null {
	return useContext(FeatureSwitcherContext);
}

/** 탭 패널은 hidden으로 마운트가 유지되므로 ResizeObserver로 표시 여부를 감지해 해제한다. */
export function useRegisterPanelHeader(ref: RefObject<HTMLElement | null>): void {
	const switcher = useFeatureSwitcher();
	const register = switcher?.registerHeader;
	useEffect(() => {
		const el = ref.current;
		if (!register || !el) return;
		let release: (() => void) | null = null;
		const sync = () => {
			const visible = el.getClientRects().length > 0;
			if (visible && !release) release = register();
			else if (!visible && release) {
				release();
				release = null;
			}
		};
		sync();
		const observer = new ResizeObserver(sync);
		observer.observe(el);
		return () => {
			observer.disconnect();
			release?.();
		};
	}, [register, ref]);
}
