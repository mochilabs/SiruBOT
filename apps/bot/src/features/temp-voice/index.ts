/**
 * 임시 음성 채널(JTC) 기능의 공개 표면. 다른 feature나 core/services는 이 파일을 통해서만 들어와요.
 * (Sapphire 리스너는 features/temp-voice/discord 아래에서 스토어가 직접 읽어요.)
 */
export { createTempVoiceService, jtcEmptyGraceText, TempVoiceService } from './application/tempVoiceService.ts';
export { tempVoiceMessages } from './discord/tempVoiceMessages.ts';
export { createJtcSetupResponder } from './inbound/jtcSetup.ts';
