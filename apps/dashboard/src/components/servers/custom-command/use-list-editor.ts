import { useRef } from "react";

export interface ListEditor<T> {
	keys: readonly string[];
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

	// 항목 정체성 보존용 안정 key 배열 — moveItem/removeItem과 동기화해
	// 중간 삭제·순서 이동 시 뒤 항목이 앞 index를 물려받아 편집 상태가 오염되는 걸 막아요.
	// 데이터 객체(T)에 필드를 섞지 않아 zod 스키마·저장 페이로드에는 영향을 주지 않아요.
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
