import { useRef } from "react";

export interface ListEditor<T> {
	updateItem: (index: number, next: T) => void;
	moveItem: (index: number, delta: -1 | 1) => void;
	removeItem: (index: number) => void;
}

/**
 * "배열 + onChange" 형태 목록 편집기의 공통 조작 — 스텝 조립·디자인 구성 요소가 함께 써요.
 * 최신 items/onChange를 ref로 비춰둬서 비동기 작업(업로드) 뒤에도 렌더 시점의 값 덮어쓰기를 막아요.
 */
export function useListEditor<T>(items: readonly T[], onChange: (next: T[]) => void): ListEditor<T> {
	const stateRef = useRef({ items, onChange });
	stateRef.current = { items, onChange };

	const updateItem = (index: number, next: T) => {
		const current = stateRef.current;
		current.onChange(current.items.map((item, i) => (i === index ? next : item)));
	};

	const moveItem = (index: number, delta: -1 | 1) => {
		const current = stateRef.current;
		const target = index + delta;
		if (target < 0 || target >= current.items.length) return;
		const next = [...current.items];
		const [moved] = next.splice(index, 1);
		next.splice(target, 0, moved!);
		current.onChange(next);
	};

	const removeItem = (index: number) => {
		const current = stateRef.current;
		current.onChange(current.items.filter((_, i) => i !== index));
	};

	return { updateItem, moveItem, removeItem };
}
