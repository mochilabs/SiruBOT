/**
 * TTS 기능의 공개 표면. 다른 feature나 core/modules는 이 파일을 통해서만 들어와요.
 * (Sapphire 피스는 features/tts/discord 아래에서 스토어가 직접 읽어요.)
 */
export { ChatTtsService } from './application/chatTts.ts';
export { TtsService } from './application/ttsService.ts';
export { TtsPronunciationService } from './application/ttsPronunciation.ts';
export { TtsUserSettingsService } from './application/ttsUserSettings.ts';
export { getTtsConfig } from './ttsConfig.ts';
