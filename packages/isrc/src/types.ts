export interface IsrcQuery {
	title: string;
	artist: string;
	durationMs: number;
	/** Lavalink sourceName — YouTube 업로드면 `아티스트 - 제목`을 나눠서 검색해요. */
	sourceName?: string | null;
}

export interface IsrcCandidate {
	isrc: string;
	title: string;
	artist: string;
	/** 피처링·공동 아티스트 등 후보의 다른 아티스트 표기 */
	contributors?: string[];
	durationMs: number;
	provider: string;
	externalId: string;
	artworkUrl?: string;
	/**
	 * 프로바이더가 아티스트 필드 검색(`artist:"…"`)으로 찾은 후보인지.
	 * 카탈로그는 별칭(`米津玄師` ↔ `Kenshi Yonezu`)으로도 아티스트를 찾아주므로, 표기가 달라도 약한 근거가 돼요.
	 */
	artistFieldMatched?: boolean;
}

export interface ProviderContext {
	fetch: typeof fetch;
	signal?: AbortSignal;
}

export interface IsrcProvider {
	readonly name: string;
	/** 후보 목록. 업스트림 장애는 IsrcProviderError로 던지고, "찾았는데 없음"만 빈 배열이에요. */
	search(query: IsrcSearchTerms, ctx: ProviderContext): Promise<IsrcCandidate[]>;
}

/** 프로바이더에 넘기는 검색어 — 업로드 표기를 지운 아티스트·제목 */
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
	/** 장애로 끝까지 못 본 프로바이더. 비어 있지 않고 match가 null이면 "없음"이 아니라 "모름"이에요. */
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
