import type { z } from 'zod';

export function parseEnv<S extends z.ZodType>(schema: S, env: NodeJS.ProcessEnv = process.env): z.output<S> {
	const result = schema.safeParse(env);
	if (!result.success) {
		throw new Error(`Invalid environment variables:\n${result.error.message}`);
	}
	return result.data;
}

export function authKeyChain(primary: string | undefined, shared: string | undefined): string | undefined {
	return primary ?? shared;
}
