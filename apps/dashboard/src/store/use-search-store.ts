import { create } from "zustand";

interface SearchState {
	value: string;
	setValue: (value: string) => void;
	clear: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
	value: "",
	setValue: (value) => set({ value }),
	clear: () => set({ value: "" }),
}));
