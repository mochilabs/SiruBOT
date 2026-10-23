import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { replyBotRelayFailure, sendDomainError, sendError } from './common.ts';
import { DataApiError } from './serveCached.ts';

function fakeReply() {
	const state: { status: number | null; body: unknown } = { status: null, body: null };
	const reply = {
		code(n: number) {
			state.status = n;
			return reply;
		},
		send(body: unknown) {
			state.body = body;
			return reply;
		}
	};
	return { reply, state };
}

describe('sendError', () => {
	it('DataApiError는 상태코드·코드·메시지를 그대로 내린다', () => {
		const { reply, state } = fakeReply();
		sendError(reply, new DataApiError(409, 'pending_conflict', '이전 요청이 아직 처리 중이에요.'));

		expect(state.status).toBe(409);
		expect(state.body).toEqual({ error: 'pending_conflict', message: '이전 요청이 아직 처리 중이에요.' });
	});

	it('ZodError는 400 invalid_params로 모아 내린다', () => {
		const { reply, state } = fakeReply();
		const parsed = z.object({ id: z.string() }).safeParse({});
		sendError(reply, parsed.error);

		expect(state.status).toBe(400);
		const body = state.body as { error: string; message: string };
		expect(body.error).toBe('invalid_params');
		expect(body.message).toContain('id:');
	});

	it('그 외 에러는 500으로 내리고 스택과 원인 메시지를 싣지 않는다', () => {
		const { reply, state } = fakeReply();
		sendError(reply, new Error('내부 DB 연결 끊김'));

		expect(state.status).toBe(500);
		const body = state.body as { error: string; message: string };
		expect(body).toEqual({ error: 'internal_error', message: '일시적인 오류예요. 잠시 후 다시 시도해 주세요.' });
		expect(JSON.stringify(body)).not.toContain('내부 DB 연결 끊김');
	});
});

describe('replyBotRelayFailure', () => {
	const rejected = { code: 'guild_data_rejected', message: null as string | null, fallback: '봇이 요청을 거절했어요.' };

	it('redis_unavailable는 503으로 매핑한다', () => {
		const { reply, state } = fakeReply();
		replyBotRelayFailure(reply, 'redis_unavailable', rejected);

		expect(state.status).toBe(503);
		expect((state.body as { error: string }).error).toBe('redis_unavailable');
	});

	it('timeout은 502 bot_timeout으로 매핑한다', () => {
		const { reply, state } = fakeReply();
		replyBotRelayFailure(reply, 'timeout', rejected);

		expect(state.status).toBe(502);
		expect((state.body as { error: string }).error).toBe('bot_timeout');
	});

	it('bot_error는 400으로 내리고 봇이 실어 보낸 메시지를 우선한다', () => {
		const { reply, state } = fakeReply();
		replyBotRelayFailure(reply, 'bot_error', { ...rejected, message: '마커 채널 권한이 없어요.' });

		expect(state.status).toBe(400);
		expect(state.body).toEqual({ error: 'guild_data_rejected', message: '마커 채널 권한이 없어요.' });
	});

	it('bot_error에 메시지가 없으면 폴백 문구를 쓴다', () => {
		const { reply, state } = fakeReply();
		replyBotRelayFailure(reply, 'bot_error', rejected);

		expect(state.status).toBe(400);
		expect(state.body).toEqual({ error: 'guild_data_rejected', message: '봇이 요청을 거절했어요.' });
	});
});

describe('sendDomainError', () => {
	it('도메인 에러의 identifier가 있으면 그대로 에러 코드로 쓴다', () => {
		const { reply, state } = fakeReply();
		const error = Object.assign(new Error('위치를 찾을 수 없어요.'), { name: 'WeatherError', identifier: 'location_not_found' });
		sendDomainError(reply, error, 'weather_error');

		expect(state.status).toBe(400);
		expect(state.body).toEqual({ error: 'location_not_found', message: '위치를 찾을 수 없어요.' });
	});

	it('identifier가 없으면 호출부의 fallbackCode를 쓴다', () => {
		const { reply, state } = fakeReply();
		const error = Object.assign(new Error('배경 이미지를 처리하지 못했어요.'), { name: 'GreetingBackgroundError' });
		sendDomainError(reply, error, 'greeting_error');

		expect(state.status).toBe(400);
		expect(state.body).toEqual({ error: 'greeting_error', message: '배경 이미지를 처리하지 못했어요.' });
	});
});
