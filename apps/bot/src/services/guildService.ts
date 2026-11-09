/**
 * GuildService — 길드 설정 캐시 저장소(GuildSettingsStore)를 들고 있는 클래스예요.
 * 설정 읽기·쓰기 로직은 ./guildSettings/ 하위 모듈에 있고, 호출하는 쪽이 모듈 함수에
 * 이 인스턴스를 저장소로 넘겨 써요 (예: playback.getVolume(container.guildService, guildId)).
 *
 * | 모듈 | 책임 |
 * |---|---|
 * | guildSettings/types.ts | 타입·순수 함수(모드 정규화·채널 토글 규칙·필드 매핑) |
 * | guildSettings/store.ts | 캐시(60s TTL)·무효화 세대·upsertField/upsertData 공용 헬퍼 |
 * | guildSettings/playback.ts | 볼륨·DJ·반복·연관 재생·컨트롤러·SponsorBlock |
 * | guildSettings/channels.ts | 기본 채널·고정 채널(모드/입력 삭제) |
 * | guildSettings/jtc.ts | 임시 음성방(JTC) 셋팅 |
 * | guildSettings/mixer.ts | 갭리스·크로스페이드 |
 * | guildSettings/chatPolicy.ts | AI 채팅·채팅 TTS·채팅 유틸·카운팅·커맨드 접두사 |
 */
import { GuildSettingsStore } from './guildSettings/store.ts';

export type {
	AiMode,
	ChannelToggleSettings,
	ChatToolMode,
	ChatToolName,
	ChatToolSettings,
	MixerSettings,
	PinnedChannelMode,
	TtsMode,
	TtsSettings
} from './guildSettings/types.ts';
export { isChannelToggleEnabled, isTtsEnabled, normalizeAiMode, normalizeChatToolMode } from './guildSettings/types.ts';

export class GuildService extends GuildSettingsStore {}
