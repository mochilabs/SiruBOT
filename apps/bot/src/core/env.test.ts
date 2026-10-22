import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.ts';

/** 스키마가 요구하는 최소한의 정상 env — 필수 키만 채운 고정 픽스처예요. */
const validEnv = (): Record<string, string | undefined> => ({
	DISCORD_TOKEN: 'token',
	OWNERS: '111111111111111111 222222222222222222',
	LAVALINK_HOSTS: 'main_localhost_2333_youshallnotpass',
	BOT_ACTIVITY: '/재생 | %bot_name%',
	REDIS_URL: 'redis://localhost:6379',
	DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/sirubot',
	DEV_GUILD_IDS: '333333333333333333'
});

describe('validateEnv — 봇 env 스키마 (fail-closed)', () => {
	it('필수 키가 모두 있으면 통과하고 선택 키는 없어도 돼요', () => {
		expect(validateEnv(validEnv())).toMatchObject({ DISCORD_TOKEN: 'token' });
	});

	it.each(['DISCORD_TOKEN', 'OWNERS', 'LAVALINK_HOSTS', 'BOT_ACTIVITY', 'REDIS_URL', 'DATABASE_URL', 'DEV_GUILD_IDS'] as const)(
		'필수 키 %s가 없으면 기동을 차단해요',
		(key) => {
			const env = validEnv();
			delete env[key];
			expect(() => validateEnv(env)).toThrow(/Invalid environment variables/);
		}
	);

	it.each(['DISCORD_TOKEN', 'OWNERS', 'LAVALINK_HOSTS', 'BOT_ACTIVITY', 'REDIS_URL'] as const)('필수 키 %s가 공백뿐이면 기동을 차단해요', (key) => {
		const env = validEnv();
		env[key] = '   ';
		expect(() => validateEnv(env)).toThrow(/Invalid environment variables/);
	});

	it('숫자형 tunable에 오타(문자열)가 있으면 기동을 차단해요', () => {
		const env = { ...validEnv(), HEALTH_PORT: 'eighty eighty' };
		expect(() => validateEnv(env)).toThrow(/HEALTH_PORT/);
	});

	it('숫자형 tunable이 비어 있으면 미설정으로 보고 통과해요 (.env의 `KEY=` 형태)', () => {
		const env = { ...validEnv(), HEALTH_PORT: '', LEAVE_TIMEOUT_MS: '  ' };
		expect(validateEnv(env).HEALTH_PORT).toBeUndefined();
		expect(validateEnv(env).LEAVE_TIMEOUT_MS).toBeUndefined();
	});

	it('숫자형 tunable이 정상 숫자면 통과해요', () => {
		const env = { ...validEnv(), HEALTH_PORT: '8081', AUTOPLAY_HIGH_SIM: '0.75' };
		expect(validateEnv(env)).toMatchObject({ HEALTH_PORT: 8081 });
	});

	it('LOGLEVEL은 숫자·레벨 이름 둘 다 허용하고, 오타는 차단해요', () => {
		expect(validateEnv({ ...validEnv(), LOGLEVEL: '3' })).toMatchObject({ LOGLEVEL: 3 });
		expect(validateEnv({ ...validEnv(), LOGLEVEL: 'debug' })).toMatchObject({ LOGLEVEL: 'debug' });
		expect(() => validateEnv({ ...validEnv(), LOGLEVEL: 'verbose' })).toThrow(/LOGLEVEL/);
	});

	it('선택 키(DATA_API_URL·AUTH_KEY 등)는 없어도 통과해요', () => {
		const env = validEnv();
		expect(() => validateEnv(env)).not.toThrow();
		expect(validateEnv(env)).not.toHaveProperty('DATA_API_URL');
	});
});
