import type { FastifyInstance } from 'fastify';
import { embedFixMetadataRequestSchema, swapEmbedFixUrl, type EmbedFixResult } from '@sirubot/utils';
import { serveCached } from './serveCached.ts';
import { sendError } from './common.ts';
import {
	EMBED_FIX_TTL_SECONDS,
	boothEmbedFixResult,
	embedFixCacheKey,
	fetchBoothMeta,
	fetchFxTwitterStatus,
	fetchInstagramMeta,
	fetchOgMeta,
	instagramEmbedFixResult,
	ogEmbedFixResult,
	xEmbedFixResult
} from '../providers/embedFix.ts';

/** 임베드 복구 메타데이터 — X·인스타그램·BOOTH·TikTok·Reddit·Pixiv·Threads 팬아웃 (봇 채팅 유틸 리스너가 호출해요). */

/** OG 카드 사이트별 서킷브레이커 프로바이더 이름 — 프로바이더 교체 시 여기만 고쳐요 */
const OG_CARD_PROVIDERS = { tiktok: 'tnktok', reddit: 'vxreddit', pixiv: 'phixiv', threads: 'fixthreads' } as const;

export function registerEmbedFixRoutes(fastify: FastifyInstance): void {
	fastify.post('/v1/embed-fix/metadata', async (request, reply) => {
		try {
			const parsed = embedFixMetadataRequestSchema.parse(request.body);
			const results: EmbedFixResult[] = [];
			for (const link of parsed.links) {
				if (link.site === 'x') {
					const { data: status } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('x', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'fxtwitter',
						fetchFresh: () => fetchFxTwitterStatus(link.url)
					});
					results.push(xEmbedFixResult(link, status));
				} else if (link.site === 'instagram') {
					// kirkstagram(작성자·캐러셀) + toinstagram(캡션)을 병합하고, 둘 다 실패하면 kkinstagram 이미지로 폴백해요
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('instagram', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'instagram-meta',
						fetchFresh: () => fetchInstagramMeta(link)
					});
					results.push(instagramEmbedFixResult(link, meta));
				} else if (link.site === 'booth') {
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('booth', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'booth',
						fetchFresh: () => fetchBoothMeta(link.url)
					});
					results.push(boothEmbedFixResult(link, meta));
				} else {
					// OG 카드 사이트(TikTok·Reddit·Pixiv·Threads) — 고친 주소에서 og 메타를 읽어 카드를 만들어요
					const provider = OG_CARD_PROVIDERS[link.site];
					const swappedUrl = swapEmbedFixUrl(link.site, link.url);
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey(link.site, link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider,
						fetchFresh: () => fetchOgMeta(swappedUrl ?? link.url)
					});
					results.push(ogEmbedFixResult(link, meta, swappedUrl));
				}
			}
			return reply.send({ results });
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
