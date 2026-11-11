import type { Server } from 'node:http';
import { Events } from 'discord.js';
import type { Client } from 'discord.js';
import { getConfig } from '../lib/config.ts';

/** Docker 헬스체크용 HTTP 서버를 만들고 listen해요. */
export const startHealthServer = async (client: Client): Promise<Server> => {
	const { createServer } = await import('node:http');
	const healthPort = getConfig().health.port;
	let everReady = false;
	let unreadySince: number | null = null;
	client.once(Events.ClientReady, () => {
		everReady = true;
		unreadySince = null;
	});
	const healthServer = createServer((_req, res) => {
		const ready = client.isReady();
		if (ready) {
			everReady = true;
			unreadySince = null;
		} else if (everReady && unreadySince === null) {
			unreadySince = Date.now();
		}
		// 부팅 구간(READY 이전)은 503, 준비 완료 후의 일시 재연결은 200을 유지해
		// 게이트웨이 재연결 중 restart가 증폭되는 것을 막는다. 2분 내 복구 실패 시 다시 503.
		const reconnectingWithinGrace = everReady && unreadySince !== null && Date.now() - unreadySince < 120_000;
		const isHealthy = ready || reconnectingWithinGrace;
		res.writeHead(isHealthy ? 200 : 503, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ ok: isHealthy, ready, everReady, wsStatus: client.ws.status }));
	});
	healthServer.listen(healthPort, '0.0.0.0', () => {
		client.logger.info(`Health check server listening on :${healthPort}`);
	});
	return healthServer;
};
