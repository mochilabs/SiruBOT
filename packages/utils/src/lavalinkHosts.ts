import { z } from 'zod';

/**
 * LAVALINK_HOSTS 파싱 — `id_host_port[_password]` 콤마 목록을 노드 설정 배열로 만들어요.
 * 부트스트랩의 인라인 문자열 처리를 대체: 형식 오류는 부팅이 끝나기 전에(로그인 뒤 Lavalink 연결 직전)
 * 명확한 메시지로 실패하고, 결과는 zod로 검증된 타입이에요. 비밀번호의 `_`는 폴백 조각 병합으로 처리해요.
 */
const nodeConfigSchema = z.object({
	id: z.string().min(1),
	host: z.string().min(1),
	port: z.number().int().min(1).max(65535),
	authorization: z.string().min(1)
});

export type LavalinkNodeConfig = z.infer<typeof nodeConfigSchema>;

export interface ParsedLavalinkHosts {
	hosts: LavalinkNodeConfig[];
	/** 개별 비밀번호도 전역 기본도 없는 노드가 있어 'youshallnotpass'로 폴백했으면 true */
	defaultPasswordUsed: boolean;
}

export function parseLavalinkHosts(raw: string, globalPassword: string): ParsedLavalinkHosts {
	const hosts: LavalinkNodeConfig[] = [];
	let defaultPasswordUsed = false;

	for (const [index, entry] of raw.split(',').entries()) {
		const parts = entry.trim().split('_');
		if (parts.length < 3) {
			throw new Error(`Invalid LAVALINK_HOSTS format at index ${index}: "${entry}". ` + `Expected: "id_host_port[_password]"`);
		}
		const [id, host, portStr, ...passwordParts] = parts;
		if (!id || !host) {
			throw new Error(`Invalid LAVALINK_HOSTS format at index ${index}: "${entry}". id/host must not be empty.`);
		}
		const port = parseInt(portStr, 10);
		if (isNaN(port) || port <= 0 || port > 65535) {
			throw new Error(`Invalid port "${portStr}" for node "${id}"`);
		}
		const explicitPassword = passwordParts.length > 0 ? passwordParts.join('_') : globalPassword;
		const password = explicitPassword || 'youshallnotpass';
		if (!explicitPassword) defaultPasswordUsed = true;
		hosts.push(nodeConfigSchema.parse({ id, host, port, authorization: password }));
	}

	return { hosts, defaultPasswordUsed };
}
