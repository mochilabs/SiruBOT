# isrc agent instructions (`packages/isrc`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `packages/isrc/src/`.

- Looks up the ISRC of a track that has none (YouTube uploads) by searching external catalogs with its artist, title and length. `resolveIsrc` (`resolve.ts`) tries providers in order and stops at the first confident match.
- Pure module: it never reads env and takes `fetch` as an option, so tests pass a fake `fetch` with canned upstream JSON. Callers own scheduling, caching and circuit breaking (data-api `services/isrcEnricher.ts`).
- Matching (`match.ts`) normalizes with `@sirubot/utils/trackIdentity`, the same rule the bot and the chart use. Never add a looser comparison here; a wrong ISRC merges two different songs in the chart.
- A provider implements `IsrcProvider` (`types.ts`). Throw `IsrcProviderError` for upstream failures (the caller retries later); return `[]` only for "searched and found nothing". Rate limits live inside the provider (`rateLimit.ts`).
- MusicBrainz requires a descriptive `User-Agent`. Use a generic client name and the public repo URL; never put personal contact details in it.
- `yarn workspace @sirubot/isrc build && yarn workspace @sirubot/isrc probe "<artist>" "<title>" <durationMs>` hits the real APIs for manual checks. It is not part of the tests.
- Provider strengths (checked against the live APIs): Deezer free-text search returns `isrc` in its hits and covers Latin-script names (`Kenshi Yonezu`); its field syntax (`artist:"…"`) often returns nothing, so don't use it. MusicBrainz matches native-script names (`米津玄師`) through `artist:"…"` but not their romanized aliases. Together they map both spellings to the same ISRC.
