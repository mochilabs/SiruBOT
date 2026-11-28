import { useRef } from "react";

export interface ListEditor<T> {
	keys: readonly string[];
	updateItem: (index: number, next: T) => void;
	moveItem: (index: number, delta: -1 | 1) => void;
	removeItem: (index: number) => void;
}

export function useListEditor<T>(items: readonly T[], onChange: (next: T[]) => void): ListEditor<T> {
	const stateRef = useRef({ items, onChange });
	stateRef.current = { items, onChange };

	const keysRef = useRef<{ seq: number; list: string[] }>({ seq: 0, list: [] });
	const k = keysRef.current;
	while (k.list.length < items.length) {
		k.list.push(`k-${++k.seq}`);
	}
	if (k.list.length > items.length) {
		k.list.length = items.length;
	}

	const updateItem = (index: number, next: T) => {
		const current = stateRef.current;
		current.onChange(current.items.map((item, i) => (i === index ? next : item)));
	};

	const moveItem = (index: number, delta: -1 | 1) => {
		const current = stateRef.current;
		const target = index + delta;
		if (target < 0 || target >= current.items.length) return;
		const [movedKey] = k.list.splice(index, 1);
		if (movedKey !== undefined) k.list.splice(target, 0, movedKey);
		const next = [...current.items];
		const [moved] = next.splice(index, 1);
		next.splice(target, 0, moved!);
		current.onChange(next);
	};

	const removeItem = (index: number) => {
		const current = stateRef.current;
		k.list.splice(index, 1);
		current.onChange(current.items.filter((_, i) => i !== index));
	};

	return { keys: k.list, updateItem, moveItem, removeItem };
}
