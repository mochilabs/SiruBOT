import { create } from "zustand";

interface UIState {
	scrolled: boolean;
	scrollTopVisible: boolean;
	mobileMenuOpen: boolean;
	commandPaletteOpen: boolean;

	setMobileMenuOpen: (open: boolean) => void;
	toggleMobileMenu: () => void;
	updateScrollState: (scrollY: number) => void;
	setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
	scrolled: false,
	scrollTopVisible: false,
	mobileMenuOpen: false,
	commandPaletteOpen: false,

	setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
	toggleMobileMenu: () => set((s) => ({ mobileMenuOpen: !s.mobileMenuOpen })),
	updateScrollState: (scrollY) => {
		set({
			scrolled: scrollY > 8,
			scrollTopVisible: scrollY > 400,
		});
	},
	setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
