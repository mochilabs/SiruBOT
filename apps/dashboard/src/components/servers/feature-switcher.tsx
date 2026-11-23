"use client";

import { createContext, type ReactNode, type RefObject, useCallback, useContext, useEffect, useMemo, useState } from "react";

interface FeatureSwitcher {
	/** 기능 전환 바텀시트가 열려 있는지 */
	open: boolean;
	setOpen: (open: boolean) => void;
	/** 패널 제목(PanelHeader)이 화면에 있어서 제목이 전환 버튼을 겸하는지 — 그러면 상단 기능 버튼은 숨겨요. */
	headerPresent: boolean;
	/** PanelHeader가 마운트되는 동안 등록해요. 반환값은 해제 함수예요. */
	registerHeader: () => () => void;
}

const FeatureSwitcherContext = createContext<FeatureSwitcher | null>(null);

/**
 * 모바일 기능 전환 상태 — 상단 막대(ServerMobileNav)와 패널 제목(PanelHeader)이 같은 바텀시트를 열도록 이어줘요.
 * 제목이 없는 패널은 등록이 없어서 상단 기능 버튼이 그대로 남아요 (전환 수단을 잃지 않아요).
 */
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

/** 대시보드 셸 밖(테스트·단독 렌더)에서는 null이라 PanelHeader는 평범한 제목으로 그려져요. */
export function useFeatureSwitcher(): FeatureSwitcher | null {
	return useContext(FeatureSwitcherContext);
}

/**
 * PanelHeader가 화면에 보이는 동안만 제목을 전환 버튼으로 쓰겠다고 등록해요.
 * 탭 패널은 한 번 열면 hidden으로 마운트가 유지돼서, 크기가 0이 되는 순간(display: none)을 ResizeObserver로 감지해 해제해요.
 */
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
