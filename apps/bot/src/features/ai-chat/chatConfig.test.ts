import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setConfigForTesting } from '../../lib/config.ts';
import { makeTestConfig } from '../../lib/config.testing.ts';
import { getChatConfig } from './chatConfig.ts';

beforeEach(() => setConfigForTesting(makeTestConfig()));
afterEach(() => setConfigForTesting(null));

describe('getChatConfig', () => {
	it('returns null when the model is not configured', () => {
		setConfigForTesting(makeTestConfig({ OPENAI_COMPATIBLE_API_URL: 'http://x/v1' }));
		expect(getChatConfig()).toBeNull();
	});

	it('reads endpoints, credentials and knobs from the environment', () => {
		setConfigForTesting(
			makeTestConfig({
				OPENAI_COMPATIBLE_API_URL: ' http://x/v1/ ',
				CHAT_MODEL: ' chat-model ',
				OPENAI_API_KEY: ' key ',
				LLM_API_TIMEOUT_MS: '500',
				CHAT_STREAM_UPDATE_MS: '100',
				ENABLE_THINK_TOKEN: 'TRUE'
			})
		);
		expect(getChatConfig()).toEqual({
			apiUrl: 'http://x/v1',
			apiKey: 'key',
			model: 'chat-model',
			timeoutMs: 1000,
			streamUpdateMs: 200,
			thinkToken: true
		});
	});

	it('uses defaults when optional values are absent', () => {
		setConfigForTesting(makeTestConfig({ CHAT_MODEL: 'm' }));
		expect(getChatConfig()).toEqual({
			apiUrl: 'http://127.0.0.1:8080/v1',
			apiKey: '',
			model: 'm',
			timeoutMs: 120_000,
			streamUpdateMs: 450,
			thinkToken: false
		});
	});
});
