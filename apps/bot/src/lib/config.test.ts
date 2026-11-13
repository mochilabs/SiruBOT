import { afterEach, describe, expect, it } from 'vitest';

import { getConfig, isConfigLoaded, loadConfig, setConfigForTesting, shouldLogQueries, validateEnv, type Config, type RawEnv } from './config.ts';
import { makeTestConfig, minimalTestEnv } from './config.testing.ts';

const validEnv = minimalTestEnv;

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
		expect(validateEnv({ ...validEnv(), LOGLEVEL: '' }).LOGLEVEL).toBeUndefined();
		expect(() => validateEnv({ ...validEnv(), LOGLEVEL: 'verbose' })).toThrow(/LOGLEVEL/);
	});

	it('선택 키(DATA_API_URL·AUTH_KEY 등)는 없어도 통과해요', () => {
		const env = validEnv();
		expect(() => validateEnv(env)).not.toThrow();
		expect(validateEnv(env)).not.toHaveProperty('DATA_API_URL');
	});
});

/** 기본값 한 줄 — env 값을 얹어 만든 Config에서 필드를 꺼내요. */
const configWith = (env: RawEnv): Config => loadConfig({ ...validEnv(), ...env });

describe('loadConfig — 필수 키·검증', () => {
	it.each(['DISCORD_TOKEN', 'OWNERS', 'LAVALINK_HOSTS', 'BOT_ACTIVITY', 'REDIS_URL', 'DATABASE_URL', 'DEV_GUILD_IDS'] as const)(
		'필수 키 %s가 없으면 throw해요 (진입점이 exit(1))',
		(key) => {
			const env = validEnv();
			delete env[key];
			expect(() => loadConfig(env)).toThrow(/Invalid environment variables/);
		}
	);

	it('형식 오류(숫자형 tunable 오타)도 throw해요', () => {
		expect(() => configWith({ MIXER_CALL_TIMEOUT_MS: 'fast' })).toThrow(/MIXER_CALL_TIMEOUT_MS/);
		expect(() => configWith({ CHAT_CONTEXT_TOKEN_BUDGET: 'abc' })).toThrow(/CHAT_CONTEXT_TOKEN_BUDGET/);
	});

	it('결과는 그룹까지 얼려 있어요', () => {
		const config = makeTestConfig();
		expect(Object.isFrozen(config)).toBe(true);
		expect(Object.isFrozen(config.discord)).toBe(true);
		expect(Object.isFrozen(config.discord.owners)).toBe(true);
		expect(Object.isFrozen(config.aiChat)).toBe(true);
	});

	it('프로세스 환경을 읽지 않아요 (넘긴 env만 사용)', () => {
		expect(configWith({ DISCORD_TOKEN: 'only-from-arg' }).discord.token).toBe('only-from-arg');
	});
});

describe('loadConfig — 기본값 (선택 키가 전부 없을 때)', () => {
	const config = loadConfig(validEnv());

	it('플래그·그룹별 기본값', () => {
		expect(config.isProduction).toBe(false);
		expect(config.logLevel).toBe(3);
		expect(config.registerCommands).toBe(false);
		expect(config.health.port).toBe(8080);
		expect(config.shard).toEqual({ managerUrl: undefined, authKey: undefined, identifyRetryMs: 5000 });
		expect(config.lavalink.defaultPassword).toBe('');
		expect(config.redis.signingKey).toBe('');
		expect(config.dataApi).toEqual({ baseUrl: null, authKey: '' });
		expect(config.tts).toEqual({ url: '', defaultVoice: null });
		expect(config.search).toEqual({ searxngEnabled: true, searxngBaseUrl: undefined });
		expect(config.mixer).toEqual({ callTimeoutMs: 5000, confirmTimeoutMs: 5000 });
		expect(config.autoplay).toEqual({ highSimilarity: 0.75, lowSimilarity: 0.2 });
		expect(config.notifier).toEqual({ debounceMs: 300, progressTickMs: 5000 });
		expect(config.playback).toEqual({ maxConsecutiveErrors: 3, leaveTimeoutMs: 300000 });
		expect(config.tempVoice.emptyGraceMs).toBe(30000);
	});

	it('AI 채팅 기본값 — 모델이 없어서 채팅 off(getChatConfig가 null)지만 나머지 값은 기본값이에요', () => {
		expect(config.aiChat).toEqual({
			apiUrl: 'http://127.0.0.1:8080/v1',
			apiKey: '',
			model: '',
			timeoutMs: 120_000,
			streamUpdateMs: 450,
			thinkToken: false,
			contextTokenBudget: 60_000
		});
	});

	it('필수 키는 원본 그대로 노출해요 (소유자·길드 목록은 공백 split)', () => {
		expect(config.discord).toEqual({
			token: 'token',
			owners: ['111111111111111111', '222222222222222222'],
			devGuildIds: ['333333333333333333'],
			botActivity: '/재생 | %bot_name%'
		});
		expect(config.redis.url).toBe('redis://localhost:6379');
		expect(config.database.url).toBe('postgresql://postgres:postgres@localhost:5432/sirubot');
		expect(config.lavalink.hosts).toBe('main_localhost_2333_youshallnotpass');
	});
});

describe('loadConfig — `Number(x) || 기본값` 계열 (0·빈 값·공백은 미설정, 음수는 통과)', () => {
	const cases: Array<[string, (config: Config) => number, number]> = [
		['MIXER_CALL_TIMEOUT_MS', (c) => c.mixer.callTimeoutMs, 5000],
		['MIXER_CONFIRM_TIMEOUT_MS', (c) => c.mixer.confirmTimeoutMs, 5000],
		['AUTOPLAY_HIGH_SIM', (c) => c.autoplay.highSimilarity, 0.75],
		['AUTOPLAY_LOW_SIM', (c) => c.autoplay.lowSimilarity, 0.2],
		['NOTIFIER_DEBOUNCE_MS', (c) => c.notifier.debounceMs, 300],
		['NOTIFIER_PROGRESS_TICK_MS', (c) => c.notifier.progressTickMs, 5000],
		['MAX_CONSECUTIVE_ERRORS', (c) => c.playback.maxConsecutiveErrors, 3],
		['LEAVE_TIMEOUT_MS', (c) => c.playback.leaveTimeoutMs, 300000],
		['JTC_EMPTY_GRACE_MS', (c) => c.tempVoice.emptyGraceMs, 30000]
	];

	describe.each(cases)('%s', (key, pick, fallback) => {
		it.each([
			['미설정', undefined],
			['빈 문자열', ''],
			['공백', '   '],
			['0 (미설정 취급)', '0']
		])('%s이면 기본값 %#', (_label, raw) => {
			expect(pick(configWith({ [key]: raw }))).toBe(fallback);
		});

		it('양수는 그대로, 음수도 그대로 통과해요 (클램프 없음)', () => {
			expect(pick(configWith({ [key]: '12.5' }))).toBe(12.5);
			expect(pick(configWith({ [key]: '-5' }))).toBe(-5);
			expect(pick(configWith({ [key]: '1e3' }))).toBe(1000);
		});
	});
});

describe('loadConfig — `parseInt(x ?? 기본값, 10)` 계열 (0은 그대로, 빈 값은 NaN)', () => {
	it('LOGLEVEL — 숫자는 그대로, 레벨 이름은 tslog 숫자로, 미설정·빈 값은 3(info)', () => {
		expect(configWith({ LOGLEVEL: '0' }).logLevel).toBe(0);
		expect(configWith({ LOGLEVEL: '4' }).logLevel).toBe(4);
		expect(configWith({}).logLevel).toBe(3);
		expect(configWith({ LOGLEVEL: '' }).logLevel).toBe(3);
		expect(configWith({ LOGLEVEL: '  ' }).logLevel).toBe(3);
		expect(configWith({ LOGLEVEL: 'debug' }).logLevel).toBe(2);
		expect(configWith({ LOGLEVEL: 'warn' }).logLevel).toBe(4);
	});

	it('DB 쿼리 로그는 debug(2) 이하에서만 붙여요 (info 이상에서는 debug 줄이 걸러져요)', () => {
		expect(shouldLogQueries(0)).toBe(true);
		expect(shouldLogQueries(2)).toBe(true);
		expect(shouldLogQueries(3)).toBe(false);
		expect(shouldLogQueries(4)).toBe(false);
	});

	it('HEALTH_PORT — 0은 0, 미설정·빈 값은 8080', () => {
		expect(configWith({ HEALTH_PORT: '9000' }).health.port).toBe(9000);
		expect(configWith({ HEALTH_PORT: '0' }).health.port).toBe(0);
		expect(configWith({}).health.port).toBe(8080);
		expect(configWith({ HEALTH_PORT: '' }).health.port).toBe(8080);
		expect(configWith({ HEALTH_PORT: ' ' }).health.port).toBe(8080);
	});

	it('SHARD_IDENTIFY_RETRY_MS — 하한 1000, 0·음수도 1000, 미설정·빈 값은 5000', () => {
		expect(configWith({ SHARD_IDENTIFY_RETRY_MS: '7000' }).shard.identifyRetryMs).toBe(7000);
		expect(configWith({ SHARD_IDENTIFY_RETRY_MS: '500' }).shard.identifyRetryMs).toBe(1000);
		expect(configWith({ SHARD_IDENTIFY_RETRY_MS: '0' }).shard.identifyRetryMs).toBe(1000);
		expect(configWith({ SHARD_IDENTIFY_RETRY_MS: '-1' }).shard.identifyRetryMs).toBe(1000);
		expect(configWith({}).shard.identifyRetryMs).toBe(5000);
		expect(configWith({ SHARD_IDENTIFY_RETRY_MS: '' }).shard.identifyRetryMs).toBe(5000);
	});

	it('LLM_API_TIMEOUT_MS — 0·빈 값은 기본 120000, 하한 1000', () => {
		expect(configWith({ LLM_API_TIMEOUT_MS: '0' }).aiChat.timeoutMs).toBe(120_000);
		expect(configWith({ LLM_API_TIMEOUT_MS: '' }).aiChat.timeoutMs).toBe(120_000);
		expect(configWith({ LLM_API_TIMEOUT_MS: '500' }).aiChat.timeoutMs).toBe(1000);
		expect(configWith({ LLM_API_TIMEOUT_MS: '-5' }).aiChat.timeoutMs).toBe(1000);
		expect(configWith({ LLM_API_TIMEOUT_MS: '30000' }).aiChat.timeoutMs).toBe(30_000);
		expect(configWith({ LLM_API_TIMEOUT_MS: '2500.9' }).aiChat.timeoutMs).toBe(2500);
	});

	it('CHAT_STREAM_UPDATE_MS — 0·빈 값은 기본 450, 하한 200', () => {
		expect(configWith({ CHAT_STREAM_UPDATE_MS: '0' }).aiChat.streamUpdateMs).toBe(450);
		expect(configWith({ CHAT_STREAM_UPDATE_MS: '' }).aiChat.streamUpdateMs).toBe(450);
		expect(configWith({ CHAT_STREAM_UPDATE_MS: '100' }).aiChat.streamUpdateMs).toBe(200);
		expect(configWith({ CHAT_STREAM_UPDATE_MS: '900' }).aiChat.streamUpdateMs).toBe(900);
	});

	it('CHAT_CONTEXT_TOKEN_BUDGET — [1500, 100000] 클램프, 파싱 실패는 60000, 0x16진수는 parseInt가 0이라 하한', () => {
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '3000' }).aiChat.contextTokenBudget).toBe(3000);
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '100' }).aiChat.contextTokenBudget).toBe(1500);
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '0' }).aiChat.contextTokenBudget).toBe(1500);
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '999999' }).aiChat.contextTokenBudget).toBe(100_000);
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '' }).aiChat.contextTokenBudget).toBe(60_000);
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '   ' }).aiChat.contextTokenBudget).toBe(60_000);
		expect(configWith({ CHAT_CONTEXT_TOKEN_BUDGET: '0x10' }).aiChat.contextTokenBudget).toBe(1500);
	});
});

describe('loadConfig — 문자열·truthiness 규칙', () => {
	it('REGISTER_COMMANDS는 정확히 소문자 true만 켜요', () => {
		expect(configWith({ REGISTER_COMMANDS: 'true' }).registerCommands).toBe(true);
		for (const raw of ['TRUE', 'true ', ' true', '1', 'yes', '', undefined]) {
			expect(configWith({ REGISTER_COMMANDS: raw }).registerCommands).toBe(false);
		}
	});

	it('NODE_ENV는 정확히 production일 때만 프로덕션이에요', () => {
		expect(configWith({ NODE_ENV: 'production' }).isProduction).toBe(true);
		for (const raw of ['development', 'test', 'Production', ' production', '', undefined]) {
			expect(configWith({ NODE_ENV: raw }).isProduction).toBe(false);
		}
	});

	it('ENABLE_THINK_TOKEN은 trim 없이 대소문자만 무시해 true를 판별해요', () => {
		expect(configWith({ ENABLE_THINK_TOKEN: 'TRUE' }).aiChat.thinkToken).toBe(true);
		expect(configWith({ ENABLE_THINK_TOKEN: ' true' }).aiChat.thinkToken).toBe(false);
		expect(configWith({ ENABLE_THINK_TOKEN: '1' }).aiChat.thinkToken).toBe(false);
		expect(configWith({ ENABLE_THINK_TOKEN: '' }).aiChat.thinkToken).toBe(false);
	});

	it('ENABLE_SEARXNG는 기본 on, trim 없이 대소문자 무시 false일 때만 꺼요 (빈 값·오타는 on)', () => {
		expect(configWith({}).search.searxngEnabled).toBe(true);
		expect(configWith({ ENABLE_SEARXNG: 'FALSE' }).search.searxngEnabled).toBe(false);
		expect(configWith({ ENABLE_SEARXNG: 'false' }).search.searxngEnabled).toBe(false);
		expect(configWith({ ENABLE_SEARXNG: ' false' }).search.searxngEnabled).toBe(true);
		expect(configWith({ ENABLE_SEARXNG: '' }).search.searxngEnabled).toBe(true);
		expect(configWith({ ENABLE_SEARXNG: '0' }).search.searxngEnabled).toBe(true);
	});

	it('SEARXNG_BASE_URL은 trim만 해요 (미설정은 undefined, 공백뿐이면 빈 문자열)', () => {
		expect(configWith({ SEARXNG_BASE_URL: ' http://s:8888 ' }).search.searxngBaseUrl).toBe('http://s:8888');
		expect(configWith({ SEARXNG_BASE_URL: '   ' }).search.searxngBaseUrl).toBe('');
		expect(configWith({}).search.searxngBaseUrl).toBeUndefined();
	});

	it('AI 채팅 URL — 미설정이면 로컬 기본값, 빈 문자열은 그대로 빈 값(채팅 off)이고, 끝 슬래시는 잘라요', () => {
		expect(configWith({ OPENAI_COMPATIBLE_API_URL: ' http://x/v1/// ' }).aiChat.apiUrl).toBe('http://x/v1');
		expect(configWith({ OPENAI_COMPATIBLE_API_URL: '' }).aiChat.apiUrl).toBe('');
		expect(configWith({ OPENAI_COMPATIBLE_API_URL: '   ' }).aiChat.apiUrl).toBe('');
		expect(configWith({ CHAT_MODEL: '  m  ', OPENAI_API_KEY: ' k ' }).aiChat).toMatchObject({ model: 'm', apiKey: 'k' });
	});

	it('TTS — URL이 없으면 off(빈 문자열), 슬래시를 자르고, 기본 음성은 비면 null', () => {
		expect(configWith({ SIRU_TTS_URL: ' http://tts.invalid/// ' }).tts.url).toBe('http://tts.invalid');
		expect(configWith({ SIRU_TTS_URL: '   ' }).tts.url).toBe('');
		expect(configWith({ SIRU_TTS_DEFAULT_VOICE: ' edge:ko ' }).tts.defaultVoice).toBe('edge:ko');
		expect(configWith({ SIRU_TTS_DEFAULT_VOICE: '  ' }).tts.defaultVoice).toBeNull();
	});

	it('LAVALINK_DEFAULT_PASSWORD는 원본 그대로, 빈 값은 빈 문자열', () => {
		expect(configWith({ LAVALINK_DEFAULT_PASSWORD: ' pw ' }).lavalink.defaultPassword).toBe(' pw ');
		expect(configWith({ LAVALINK_DEFAULT_PASSWORD: '' }).lavalink.defaultPassword).toBe('');
	});

	it('필수 문자열은 trim하지 않은 원본이고, 소유자 목록은 단일 공백 split이라 연속 공백이 빈 항목을 만들어요 (기존 envParseArray와 동일)', () => {
		const config = configWith({ DISCORD_TOKEN: ' tok ', OWNERS: '1  2', DEV_GUILD_IDS: ' 3 ' });
		expect(config.discord.token).toBe(' tok ');
		expect(config.discord.owners).toEqual(['1', '', '2']);
		expect(config.discord.devGuildIds).toEqual(['', '3', '']);
	});
});

describe('loadConfig — 키 하나를 서로 다르게 읽던 소비자들 (일부러 통일하지 않아요)', () => {
	it('AUTH_KEY — 샤드매니저는 원본, data-api·Redis 서명은 trim', () => {
		const config = configWith({ AUTH_KEY: ' key ' });
		expect(config.shard.authKey).toBe(' key ');
		expect(config.dataApi.authKey).toBe('key');
		expect(config.redis.signingKey).toBe('key');
	});

	it('data-api 인증 키 — DATA_API_AUTH_KEY 우선, 빈 문자열이어도 AUTH_KEY로 폴백하지 않아요 (`??`)', () => {
		expect(configWith({ DATA_API_AUTH_KEY: ' a ', AUTH_KEY: 'b' }).dataApi.authKey).toBe('a');
		expect(configWith({ AUTH_KEY: ' b ' }).dataApi.authKey).toBe('b');
		expect(configWith({ DATA_API_AUTH_KEY: '', AUTH_KEY: 'b' }).dataApi.authKey).toBe('');
		expect(configWith({}).dataApi.authKey).toBe('');
	});

	it('Redis 서명 키 — REDIS_AUTH_KEY가 비어 있지 않으면 우선, 비어 있으면 AUTH_KEY로 폴백 (resolveRedisSigningKey)', () => {
		expect(configWith({ REDIS_AUTH_KEY: ' r ', AUTH_KEY: 'a' }).redis.signingKey).toBe('r');
		expect(configWith({ REDIS_AUTH_KEY: '', AUTH_KEY: 'a' }).redis.signingKey).toBe('a');
		expect(configWith({ REDIS_AUTH_KEY: '  ', AUTH_KEY: '' }).redis.signingKey).toBe('');
	});

	it('DATA_API_URL — trim·끝 슬래시 제거, 비면 null(게이트웨이 off)', () => {
		expect(configWith({ DATA_API_URL: ' http://data-api:3002/ ' }).dataApi.baseUrl).toBe('http://data-api:3002');
		expect(configWith({ DATA_API_URL: '  ' }).dataApi.baseUrl).toBeNull();
		expect(configWith({ DATA_API_URL: '/' }).dataApi.baseUrl).toBeNull();
	});

	it('샤드 설정 — SHARD_MANAGER_URL·AUTH_KEY는 원본 그대로 노출 (프로덕션 fail-fast 판단은 shardIdentity가 falsy로 해요)', () => {
		expect(configWith({ SHARD_MANAGER_URL: 'ws://sm:3001' }).shard.managerUrl).toBe('ws://sm:3001');
		expect(configWith({ SHARD_MANAGER_URL: '' }).shard.managerUrl).toBe('');
	});
});

describe('getConfig / setConfigForTesting', () => {
	afterEach(() => setConfigForTesting(null));

	it('setConfigForTesting으로 바꿔 끼운 Config를 getConfig가 돌려주고, null로 초기화해요', () => {
		expect(isConfigLoaded()).toBe(false);
		const config = makeTestConfig({ MIXER_CALL_TIMEOUT_MS: '1234' });
		setConfigForTesting(config);
		expect(isConfigLoaded()).toBe(true);
		expect(getConfig()).toBe(config);
		expect(getConfig().mixer.callTimeoutMs).toBe(1234);
		setConfigForTesting(null);
		expect(isConfigLoaded()).toBe(false);
	});
});
