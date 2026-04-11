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
	updateScrollState: (scrollY) =>
		set({
			scrolled: scrollY > 20,
			scrollTopVisible: scrollY > 400,
		}),
}));
