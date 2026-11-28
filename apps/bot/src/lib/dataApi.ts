import { getConfig } from './config.ts';

export function gatewayBaseUrl(): string | null {
	return getConfig().dataApi.baseUrl;
}

export function dataApiAuthHeaders(): Record<string, string> {
	const { authKey } = getConfig().dataApi;
	return authKey ? { authorization: authKey } : {};
}
