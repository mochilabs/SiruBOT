import { forwardDataApiGet } from "./client";

export interface TtsVoiceOption {
  id: string;
  engine: string;
  name: string;
  languages: string[];
}

export function fetchTtsVoices(lang?: string) {
  const query = lang ? `?lang=${encodeURIComponent(lang)}` : "";
  return forwardDataApiGet<{ items: TtsVoiceOption[] }>(`/v1/tts/voices${query}`);
}
