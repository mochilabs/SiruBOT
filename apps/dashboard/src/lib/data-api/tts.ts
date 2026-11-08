import { forwardDataApiGet } from "./client";

export interface TtsVoiceOption {
  id: string;
  engine: string;
  name: string;
  languages: string[];
}

/** siru_tts 음성 카탈로그 — data-api 프록시 경유. 실패하면 forward 결과를 그대로 돌려줘요. */
export function fetchTtsVoices(lang?: string) {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return forwardDataApiGet<{ items: TtsVoiceOption[] }>(`/v1/tts/voices${query}`);
}
