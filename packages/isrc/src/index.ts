export { pickMatch } from './match.js';
export { resolveIsrc, searchTermsFor, type ResolveOptions } from './resolve.js';
export { SerialRateLimiter } from './rateLimit.js';
export { createDeezerProvider, type DeezerProviderOptions } from './providers/deezer.js';
export { createMusicBrainzProvider, DEFAULT_MUSICBRAINZ_USER_AGENT, type MusicBrainzProviderOptions } from './providers/musicbrainz.js';
export {
	type IsrcCandidate,
	type IsrcMatch,
	type IsrcProvider,
	IsrcProviderError,
	type IsrcQuery,
	type IsrcResolution,
	type IsrcSearchTerms,
	type MatchConfidence,
	type ProviderContext
} from './types.js';
