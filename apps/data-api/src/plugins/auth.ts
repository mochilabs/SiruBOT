import type { FastifyInstance } from 'fastify';
import { createKeyAuthHook } from '@sirubot/app-kit';

// Exact path match only so /api/health/* routes cannot leak unauthenticated.
export default function auth(fastify: FastifyInstance, dataApiAuthKey: string | undefined): Promise<void> {
	return createKeyAuthHook({ key: dataApiAuthKey, appName: 'DataApi', excludePaths: ['/api/health'] })(fastify);
}
