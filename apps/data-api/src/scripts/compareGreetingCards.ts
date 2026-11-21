/**
 * 인사 카드 수동 비교 스크립트 — 테스트가 아니에요. GREETING_TEMPLATES 전부를 skia·satori로 PNG로 그려서 눈으로 비교하고,
 * 렌더 시간 p50/p95를 찍어요.
 *
 * 실행: yarn workspace @sirubot/data-api build && node --enable-source-maps apps/data-api/dist/scripts/compareGreetingCards.js [출력폴더] [반복횟수]
 * 폰트(resources/fonts)를 찾으려면 저장소 루트나 apps/data-api에서 실행해요. 아바타는 받지 않고 자리표시자로 그려요.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { GREETING_TEMPLATES } from '@sirubot/utils';
import { renderGreetingCard, type GreetingCardContext } from '../renderers/memberGreetingCard.ts';
import { renderGreetingCardSatori } from '../renderers/satori/greetingCard.ts';

const outDir = process.argv[2] ?? join(process.cwd(), 'greeting-compare');
const repeat = Math.max(1, Number(process.argv[3] ?? 10));

const context: GreetingCardContext = {
	userId: '123456789012345678',
	displayName: '시루',
	guildName: '시루봇 서버',
	memberCount: 1234,
	avatarUrl: null
};

function percentile(sorted: number[], p: number): number {
	return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

async function main(): Promise<void> {
	await mkdir(outDir, { recursive: true });
	const timings: Record<'skia' | 'satori', number[]> = { skia: [], satori: [] };
	const renderers = { skia: renderGreetingCard, satori: renderGreetingCardSatori } as const;

	// 첫 호출은 폰트·모듈 로드가 섞여서 워밍업으로 버려요.
	for (const name of ['skia', 'satori'] as const) await renderers[name](GREETING_TEMPLATES[0]!.image, context);

	for (const template of GREETING_TEMPLATES) {
		for (const name of ['skia', 'satori'] as const) {
			let png: Buffer | null = null;
			for (let i = 0; i < repeat; i++) {
				const start = performance.now();
				png = await renderers[name](template.image, context);
				timings[name].push(performance.now() - start);
			}
			await writeFile(join(outDir, `${template.id}.${name}.png`), png!);
		}
		console.log(`rendered ${template.id}`);
	}

	for (const name of ['skia', 'satori'] as const) {
		const sorted = [...timings[name]].sort((a, b) => a - b);
		console.log(`${name}: n=${sorted.length} p50=${percentile(sorted, 0.5).toFixed(1)}ms p95=${percentile(sorted, 0.95).toFixed(1)}ms`);
	}
	console.log(`saved to ${outDir}`);
}

main().catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
