import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@sirubot/prisma';
import { kstDay } from '@sirubot/utils/trackIdentity';
import { createIsrcProviders, IsrcEnricher } from '../services/isrcEnricher.ts';
import { applyDailyRollup, applyGroup, type BackfillTrack, planRecordingGroups, previewDailyRollup } from '../services/recordingBackfill.ts';

try {
	process.loadEnvFile();
} catch {
	// .env가 없으면 환경 변수만 써요.
}

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const forceRollup = args.includes('--force-rollup');
const enrichArg = args.find((a) => a.startsWith('--enrich='));
const enrichLimit = enrichArg ? Number(enrichArg.split('=')[1]) : 0;
const PAGE = 2_000;

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL is not set');
	process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function loadUnlinkedTracks(): Promise<BackfillTrack[]> {
	const tracks: BackfillTrack[] = [];
	let cursor: string | undefined;
	while (true) {
		const page = await db.track.findMany({
			where: { recordingId: null },
			orderBy: { id: 'asc' },
			take: PAGE,
			...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
			select: { id: true, title: true, artist: true, duration: true, source: true, thumbnail: true, isrc: true, totalPlays: true }
		});
		tracks.push(...page);
		if (page.length < PAGE) return tracks;
		cursor = page.at(-1)!.id;
	}
}

async function main() {
	const firstRecording = await db.recording.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
	const cutoff = firstRecording?.createdAt ?? new Date();

	const tracks = await loadUnlinkedTracks();
	const existing = await db.recording.findMany({ select: { id: true, key: true, isrc: true, duration: true } });
	const { groups, skipped } = planRecordingGroups(tracks, existing);
	const newGroups = groups.filter((g) => !g.recordingId);
	const merged = groups.filter((g) => g.tracks.length > 1 || g.recordingId);

	console.log(`mode: ${apply ? 'APPLY' : 'dry-run'} · rollup cutoff ${cutoff.toISOString()}`);
	console.log(
		`unlinked tracks ${tracks.length} → ${groups.length} groups (${newGroups.length} new, ${groups.length - newGroups.length} existing) · skipped ${skipped.length}`
	);
	console.log(`groups with more than one track or joining an existing recording: ${merged.length}`);
	console.log('\ntop 50 merged groups by plays:');
	for (const g of merged
		.sort((a, b) => b.tracks.reduce((s, t) => s + t.totalPlays, 0) - a.tracks.reduce((s, t) => s + t.totalPlays, 0))
		.slice(0, 50)) {
		const plays = g.tracks.reduce((s, t) => s + t.totalPlays, 0);
		console.log(`  ${plays.toString().padStart(6)}  ${g.key}${g.isrc ? ` [${g.isrc}]` : ''}${g.recordingId ? ' (existing)' : ''}`);
		for (const t of g.tracks.slice(0, 6))
			console.log(`          · ${t.source.padEnd(12)} ${t.artist} — ${t.title} (${Math.round(t.duration / 1000)}s, ${t.totalPlays})`);
		if (g.tracks.length > 6) console.log(`          · … ${g.tracks.length - 6} more`);
	}

	const rollup = await previewDailyRollup(db, cutoff);
	const earlyRows = await db.recordingDailyPlay.count({ where: { day: { lt: kstDay(cutoff) } } });
	console.log(`\nrollup (before linking new groups): ${rollup.rows} rows, ${rollup.plays} plays · existing rows before cutoff: ${earlyRows}`);

	if (!apply) {
		console.log('\ndry-run only. Re-run with --apply after a DB backup.');
		return;
	}

	let done = 0;
	for (const group of groups) {
		await applyGroup(db, group);
		if (++done % 500 === 0) console.log(`  applied ${done}/${groups.length}`);
	}
	console.log(`applied ${done} groups`);

	if (earlyRows > 0 && !forceRollup) {
		console.log('rollup skipped: rows before the cutoff already exist (backfill ran before?). Use --force-rollup to add anyway.');
	} else {
		console.log(`rollup inserted/updated ${await applyDailyRollup(db, cutoff)} rows`);
	}

	if (enrichLimit > 0) {
		const enricher = new IsrcEnricher(db, createIsrcProviders({ musicBrainzUserAgent: process.env.MUSICBRAINZ_USER_AGENT }), enrichLimit);
		console.log('isrc enrich', await enricher.runBatch(enrichLimit));
	}
}

main()
	.catch((error: unknown) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => db.$disconnect());
