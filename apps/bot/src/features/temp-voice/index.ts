/**
 * 임시 음성 채널(JTC) 기능의 공개 표면. 다른 feature나 core/services는 이 파일을 통해서만 들어와요.
 * (Sapphire 리스너는 features/temp-voice/discord 아래에서 스토어가 직접 읽어요.)
 * TempVoiceService는 lib/config.ts의 getConfig()를 직접 읽어서 application 계층 규칙(config 금지)에 맞지 않아 services/에 남아 있어요.
 */
export { JtcSetupResponder } from './inbound/jtcSetupResponder.ts';
