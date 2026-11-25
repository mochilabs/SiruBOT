import type { preHandlerAsyncHookHandler } from 'fastify';
import { createKeyPreHandler } from '@sirubot/app-kit';

export function requireAuth(key: string): preHandlerAsyncHookHandler {
	return createKeyPreHandler({ key, appName: 'storage' });
}
