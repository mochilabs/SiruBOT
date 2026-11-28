import { createApiFetcher, useGuildResource } from "@/lib/swr";

export interface VoiceContext {
	inVoice: boolean;
	voiceChannelName: string | null;
	botVoiceChannelName?: string | null;
	canControl: boolean;
	canPlay: boolean;
}

export interface VoiceContextResponse {
	voice: VoiceContext | null;
}

const voiceContextFetcher = createApiFetcher<VoiceContextResponse>("음성 연결 상태를 불러오지 못했어요.");

export function useVoiceContext(guildId: string, options?: { refreshInterval?: number }) {
	return useGuildResource<VoiceContextResponse>(guildId, "/player/voice-context", {
		fetcher: voiceContextFetcher,
		...(options?.refreshInterval !== undefined ? { refreshInterval: options.refreshInterval } : {}),
	});
}
