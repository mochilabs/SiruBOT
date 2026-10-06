import * as Sentry from '@sentry/node';

// Sentry 초기화는 공용 모듈로 이전 — 이 파일의 기존 import 경로는 그대로 유지된다.
export { initSentry } from '@sirubot/utils';

export const setSentryShardTags = (shardIds: number[] | 'auto') => {
	if (shardIds === 'auto') {
		Sentry.setTag('shard_ids', 'auto');
	} else {
		Sentry.setTag('shard_ids', shardIds.join(','));
	}
};
