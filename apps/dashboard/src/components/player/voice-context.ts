import { createApiFetcher, useGuildResource } from "@/lib/swr";

/** 요청자의 음성·권한 상태 — 봇이 실제 인가와 같은 정책으로 계산해서 내려줘요 */
export interface VoiceContext {
	inVoice: boolean;
	voiceChannelName: string | null;
	/** 재생 제어(일시정지·볼륨·건너뛰기 등) 가능 여부 */
	canControl: boolean;
	/** 곡 추가 가능 여부 */
	canPlay: boolean;
}

export interface VoiceContextResponse {
	voice: VoiceContext | null;
}

const voiceContextFetcher = createApiFetcher<VoiceContextResponse>("음성 연결 상태를 불러오지 못했어요.");

/**
 * 음성·권한 상태를 불러와요. 음성 채널 입·퇴장은 서버가 밀어주지 않으므로,
 * 버튼을 미리 비활성화하는 화면은 `refreshInterval`로 주기 재검증해요.
 */
export function useVoiceContext(guildId: string, options?: { refreshInterval?: number }) {
	return useGuildResource<VoiceContextResponse>(guildId, "/player/voice-context", {
		fetcher: voiceContextFetcher,
		...(options?.refreshInterval !== undefined ? { refreshInterval: options.refreshInterval } : {}),
	});
}
