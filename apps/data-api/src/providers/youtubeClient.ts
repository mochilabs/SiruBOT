import { Innertube } from 'youtubei.js';

const YOUTUBE_TIMEOUT_MS = 10_000;
let clientPromise: Promise<Innertube> | null = null;

export function youtubeClient(): Promise<Innertube> {
	if (!clientPromise) {
		clientPromise = Innertube.create({
			fetch: (input, init) => {
				const timeout = AbortSignal.timeout(YOUTUBE_TIMEOUT_MS);
				return fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout });
			}
		}).catch((error: unknown) => {
			clientPromise = null;
			throw error;
		});
	}
	return clientPromise;
}
