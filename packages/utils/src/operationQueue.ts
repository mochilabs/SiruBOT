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
