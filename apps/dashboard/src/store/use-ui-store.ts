import { create } from "zustand";

interface UIState {
	scrolled: boolean;
	scrollTopVisible: boolean;
	mobileMenuOpen: boolean;

	setMobileMenuOpen: (open: boolean) => void;
	toggleMobileMenu: () => void;
	updateScrollState: (scrollY: number) => void;
}

export const useUIStore = create<UIState>((set) => ({
	scrolled: false,
	scrollTopVisible: false,
	mobileMenuOpen: false,

	setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
	toggleMobileMenu: () => set((s) => ({ mobileMenuOpen: !s.mobileMenuOpen })),
	updateScrollState: (scrollY) => {
		// Hero 섹션의 가상 스크롤 높이를 고려하여,
		// 실제 콘텐츠 영역에 도달했을 때만 scrolled 상태로 전환
		const heroScrollHeight =
			typeof window !== "undefined"
				? document.getElementById("hero-section")?.offsetHeight ?? 0
				: 0;
		const effectiveScroll = Math.max(0, scrollY - heroScrollHeight + window.innerHeight);
		set({
			scrolled: heroScrollHeight > 0 ? effectiveScroll > 20 : scrollY > 20,
			scrollTopVisible: scrollY > 400,
		});
	},
}));
