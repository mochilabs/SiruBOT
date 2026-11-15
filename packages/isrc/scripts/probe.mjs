// 수동 확인용: 실제 Deezer·MusicBrainz API를 불러 매칭 결과를 보여줘요. 테스트에 넣지 않아요.
// yarn workspace @sirubot/isrc build && yarn workspace @sirubot/isrc probe "米津玄師" "Lemon" 255000 [sourceName]
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
