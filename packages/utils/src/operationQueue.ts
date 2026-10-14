/**
 * 키별 직렬화 작업 큐 — 같은 키로 들어온 비동기 작업을 이전 작업의 성공/실패와 무관하게 순서대로 실행해요.
 * 체인의 마지막 작업이 끝나면 맵에서 스스로 정리돼요(완료된 약속 누수 방지).
 * 믹서 슬롯 조작·컨트롤러 메시지 전송처럼 "같은 길드에 대한 순차 실행"이 필요한 곳에 써요.
 */
export function enqueueOperation<T>(chains: Map<string, Promise<void>>, key: string, operation: () => Promise<T>): Promise<T> {
	const previous = chains.get(key) ?? Promise.resolve();
	const result = previous.catch(() => undefined).then(operation);
	const completed = result.then(
		() => undefined,
		() => undefined
	);
	chains.set(key, completed);
	void completed.finally(() => {
		if (chains.get(key) === completed) chains.delete(key);
	});
	return result;
}
