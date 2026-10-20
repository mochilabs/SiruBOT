import type { FastifyInstance } from 'fastify';
import { createKeyAuthHook } from '@sirubot/app-kit';
import type { Env } from '../config/env.ts';

export default function auth(fastify: FastifyInstance, env: Env): Promise<void> {
	return createKeyAuthHook({ key: env.AUTH_KEY, appName: 'ShardManager', excludePaths: ['/api/health'] })(fastify);
}
