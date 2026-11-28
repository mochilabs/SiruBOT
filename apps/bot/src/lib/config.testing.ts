import { loadConfig, type Config, type RawEnv } from './config.ts';

export const minimalTestEnv = (): RawEnv => ({
	DISCORD_TOKEN: 'token',
	OWNERS: '111111111111111111 222222222222222222',
	LAVALINK_HOSTS: 'main_localhost_2333_youshallnotpass',
	BOT_ACTIVITY: '/재생 | %bot_name%',
	REDIS_URL: 'redis://localhost:6379',
	DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sirubot',
	DEV_GUILD_IDS: '333333333333333333'
});

export function makeTestConfig(overrides: RawEnv = {}): Config {
	const env = { ...minimalTestEnv(), ...overrides };
	for (const key of Object.keys(env)) {
		if (env[key] === undefined) delete env[key];
	}
	return loadConfig(env);
}
