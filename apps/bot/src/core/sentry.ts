import * as Sentry from '@sentry/node';

export { initSentry } from '@sirubot/utils/sentry';

export const setSentryShardTags = (shardIds: number[] | 'auto') => {
	if (shardIds === 'auto') {
		Sentry.setTag('shard_ids', 'auto');
	} else {
		Sentry.setTag('shard_ids', shardIds.join(','));
	}
};
