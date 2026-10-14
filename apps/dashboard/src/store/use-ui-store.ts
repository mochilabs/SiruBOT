import { create } from "zustand";

interface UIState {
	scrolled: boolean;
	scrollTopVisible: boolean;
	commandPaletteOpen: boolean;

	updateScrollState: (scrollY: number) => void;
	setCommandPaletteOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
	scrolled: false,
	scrollTopVisible: false,
	commandPaletteOpen: false,

	updateScrollState: (scrollY) => {
		set({
			scrolled: scrollY > 8,
			scrollTopVisible: scrollY > 400,
		});
	},
	setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
}));
