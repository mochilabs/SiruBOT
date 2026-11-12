const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_SCAN = 1000;

export async function findMessagesToPurge<T extends { id: string; createdTimestamp: number; author: { id: string } }>(
	fetchPage: (limit: number, before?: string) => Promise<T[]>,
	amount: number,
	targetId?: string,
	now = Date.now()
) {
	const messages: T[] = [];
	let scanned = 0;
	let before: string | undefined;
	while (messages.length < amount && scanned < MAX_SCAN) {
		const page = await fetchPage(targetId ? 100 : amount, before);
		if (!page.length) break;
		scanned += page.length;
		for (const message of page) {
			if (now - message.createdTimestamp >= MAX_AGE_MS) return { messages, scanned, limitReached: false };
			if (!targetId || message.author.id === targetId) messages.push(message);
			if (messages.length === amount) break;
		}
		before = page.at(-1)!.id;
		if (!targetId) break;
	}
	return { messages, scanned, limitReached: scanned >= MAX_SCAN && messages.length < amount };
}
