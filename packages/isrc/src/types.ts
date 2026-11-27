export interface IsrcQuery {
	title: string;
	artist: string;
	durationMs: number;
	sourceName?: string | null;
}

export interface IsrcCandidate {
	isrc: string;
	title: string;
	artist: string;
	contributors?: string[];
	durationMs: number;
	provider: string;
	externalId: string;
	artworkUrl?: string;
	artistFieldMatched?: boolean;
}

export interface ProviderContext {
	fetch: typeof fetch;
	signal?: AbortSignal;
}

export interface IsrcProvider {
	readonly name: string;
	/** Throw IsrcProviderError on upstream failure; return [] only when nothing matched. */
	search(query: IsrcSearchTerms, ctx: ProviderContext): Promise<IsrcCandidate[]>;
}

export interface IsrcSearchTerms {
	artist: string;
	title: string;
	durationMs: number;
}

export type MatchConfidence = 'exact' | 'strong';

export interface IsrcMatch {
	isrc: string;
	provider: string;
	confidence: MatchConfidence;
	candidate: IsrcCandidate;
}

export interface IsrcResolution {
	match: IsrcMatch | null;
	failedProviders: string[];
}

export class IsrcProviderError extends Error {
	public constructor(
		public readonly provider: string,
		message: string,
		public readonly status?: number
	) {
		super(`${provider}: ${message}`);
		this.name = 'IsrcProviderError';
	}
}
