import { createDeezerProvider, createMusicBrainzProvider, resolveIsrc, searchTermsFor } from '../dist/index.js';

const [artist, title, duration, sourceName] = process.argv.slice(2);
if (!artist || !title || !duration) {
	console.error('usage: probe <artist> <title> <durationMs> [sourceName]');
	process.exit(1);
}
const query = { artist, title, durationMs: Number(duration), sourceName };
console.log('terms', searchTermsFor(query));
const result = await resolveIsrc(query, { providers: [createDeezerProvider(), createMusicBrainzProvider()] });
console.log(JSON.stringify(result, null, 2));
