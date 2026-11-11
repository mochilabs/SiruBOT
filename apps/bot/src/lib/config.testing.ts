import { loadConfig, type Config, type RawEnv } from './config.ts';

/** 필수 키만 채운 최소한의 정상 env — 테스트가 Config를 통째로 손으로 만들지 않도록 기반으로 써요. */
export const minimalTestEnv = (): RawEnv => ({
	DISCORD_TOKEN: 'token',
	OWNERS: '111111111111111111 222222222222222222',
	LAVALINK_HOSTS: 'main_localhost_2333_youshallnotpass',
	BOT_ACTIVITY: '/재생 | %bot_name%',
	REDIS_URL: 'redis://localhost:6379',
	DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sirubot',
	DEV_GUILD_IDS: '333333333333333333'
});

/**
 * 테스트용 Config — 최소 env에 overrides(env 키 → 값)를 얹어 loadConfig로 만들어요.
 * 값이 undefined인 키는 env에서 지워요 (미설정 상태 재현). 기본값·클램프는 실제 loadConfig 경로를 그대로 타요.
 * 사용: `setConfigForTesting(makeTestConfig({ SIRU_TTS_URL: 'http://tts.invalid' }))` + afterEach에서 `setConfigForTesting(null)`.
 */
export function makeTestConfig(overrides: RawEnv = {}): Config {
	const env = { ...minimalTestEnv(), ...overrides };
	for (const key of Object.keys(env)) {
		if (env[key] === undefined) delete env[key];
	}
	return loadConfig(env);
}
