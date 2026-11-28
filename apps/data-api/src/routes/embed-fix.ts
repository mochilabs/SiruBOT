import type { FastifyInstance } from 'fastify';
import { embedFixMetadataRequestSchema, swapEmbedFixUrl, type EmbedFixActiveTranslateLang, type EmbedFixResult } from '@sirubot/utils';
import { serveCached } from './serveCached.ts';
import { sendError } from './common.ts';
import type { RouteDeps } from './index.ts';
import {
	EMBED_FIX_TRANSLATE_TTL_SECONDS,
	EMBED_FIX_TTL_SECONDS,
	boothEmbedFixResult,
	embedFixCacheKey,
	embedFixTranslateCacheKey,
	extractTranslatableEmbedFields,
	fetchBoothMeta,
	fetchFxTwitterStatus,
	fetchInstagramMeta,
	fetchOgMeta,
	instagramEmbedFixResult,
	ogEmbedFixResult,
	translateEmbedFixCard,
	xEmbedFixResult
} from '../providers/embedFix.ts';

const OG_CARD_PROVIDERS = { tiktok: 'tnktok', reddit: 'vxreddit', pixiv: 'phixiv', threads: 'fixthreads' } as const;

export function registerEmbedFixRoutes(fastify: FastifyInstance, deps?: Pick<RouteDeps, 'translationProvider'>): void {
	fastify.post('/v1/embed-fix/metadata', async (request, reply) => {
		try {
			const parsed = embedFixMetadataRequestSchema.parse(request.body);
			const translateTo: EmbedFixActiveTranslateLang | null = parsed.translateTo && parsed.translateTo !== 'off' ? parsed.translateTo : null;
			const results: EmbedFixResult[] = [];
			for (const link of parsed.links) {
				let result: EmbedFixResult;
				if (link.site === 'x') {
					const { data: status } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('x', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'fxtwitter',
						fetchFresh: () => fetchFxTwitterStatus(link.url)
					});
					result = xEmbedFixResult(link, status);
				} else if (link.site === 'instagram') {
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('instagram', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'instagram-meta',
						fetchFresh: () => fetchInstagramMeta(link)
					});
					result = instagramEmbedFixResult(link, meta);
				} else if (link.site === 'booth') {
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey('booth', link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider: 'booth',
						fetchFresh: () => fetchBoothMeta(link.url)
					});
					result = boothEmbedFixResult(link, meta);
				} else {
					const provider = OG_CARD_PROVIDERS[link.site];
					const swappedUrl = swapEmbedFixUrl(link.site, link.url);
					const { data: meta } = await serveCached({
						route: 'embed-fix',
						key: embedFixCacheKey(link.site, link.url),
						ttlSeconds: EMBED_FIX_TTL_SECONDS,
						provider,
						fetchFresh: () => fetchOgMeta(swappedUrl ?? link.url)
					});
					result = ogEmbedFixResult(link, meta, swappedUrl);
				}

				if (translateTo && deps?.translationProvider?.available && extractTranslatableEmbedFields(result, translateTo)) {
					try {
						const { data: translated } = await serveCached({
							route: 'embed-fix-translate',
							key: embedFixTranslateCacheKey(link.site, link.url, translateTo),
							ttlSeconds: EMBED_FIX_TRANSLATE_TTL_SECONDS,
							provider: 'openai-translate',
							fetchFresh: () => translateEmbedFixCard(result, translateTo, deps.translationProvider)
						});
						if (translated) {
							const nextTitle = translated.title && translated.title !== result.title ? translated.title : undefined;
							const nextDesc =
								translated.description && translated.description !== result.description ? translated.description : undefined;
							if (nextTitle || nextDesc) {
								result = {
									...result,
									...(nextTitle ? { translatedTitle: nextTitle } : {}),
									...(nextDesc ? { translatedDescription: nextDesc } : {}),
									translatedTo: translateTo
								};
							}
						}
					} catch {}
				}
				results.push(result);
			}
			return reply.send({ results });
		} catch (error) {
			return sendError(reply, error);
		}
	});
}
