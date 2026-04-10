import { create } from "zustand";
// Zustand example store

interface UIState {
	isSidebarOpen: boolean;
	toggleSidebar: () => void;
	closeSidebar: () => void;
	openSidebar: () => void;
}

export const useUIStore = create<UIState>((set) => ({
	isSidebarOpen: false,
	toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
	closeSidebar: () => set({ isSidebarOpen: false }),
	openSidebar: () => set({ isSidebarOpen: true }),
}));
