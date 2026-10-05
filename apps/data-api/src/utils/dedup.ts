/** In-flight 요청 합치기 — 동시 같은 키 요청은 하나의 upstream 호출을 공유해요. */
const inflight = new Map<string, Promise<unknown>>();

export function deduped<T>(key: string, task: () => Promise<T>): Promise<T> {
	const existing = inflight.get(key);
	if (existing) return existing as Promise<T>;
	const pending = task().finally(() => {
		if (inflight.get(key) === pending) inflight.delete(key);
	});
	inflight.set(key, pending);
	return pending;
}

export function inflightCount(): number {
	return inflight.size;
}
