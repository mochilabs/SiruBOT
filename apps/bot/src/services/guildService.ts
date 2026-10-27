/**
 * GuildService — 길드 설정 서비스 퍼사드. 구현은 ./guildSettings/ 하위 모듈로 분리돼 있고,
 * 소비자 계약(모듈 경로·export 목록·메서드 시그니처)은 이 파일이 그대로 유지해요.
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
import type { GuildMember } from 'discord.js';
import type { RepeatMode } from 'lavalink-client';
import * as channels from './guildSettings/channels.ts';
import * as chatPolicy from './guildSettings/chatPolicy.ts';
import * as jtc from './guildSettings/jtc.ts';
import * as mixer from './guildSettings/mixer.ts';
import * as playback from './guildSettings/playback.ts';
import { GuildSettingsStore } from './guildSettings/store.ts';
import type { AiMode, ChatToolName, MixerSettings, PinnedChannelMode, TtsMode } from './guildSettings/types.ts';

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

export class GuildService extends GuildSettingsStore {
	public async updateVolume(guildId: string, volume: number) {
		return playback.updateVolume(this, guildId, volume);
	}

	public async getVolume(guildId: string) {
		return playback.getVolume(this, guildId);
	}

	public async updateTtsVolume(guildId: string, volume: number) {
		return playback.updateTtsVolume(this, guildId, volume);
	}

	public async getTtsVolume(guildId: string) {
		return playback.getTtsVolume(this, guildId);
	}

	public async updateTtsDuck(guildId: string, duckLevel: number) {
		return playback.updateTtsDuck(this, guildId, duckLevel);
	}

	public async getTtsDuck(guildId: string) {
		return playback.getTtsDuck(this, guildId);
	}

	public async getDJRole(guildId: string): Promise<string | null> {
		return playback.getDJRole(this, guildId);
	}

	public async setDJRole(guildId: string, djRoleId: string | null) {
		return playback.setDJRole(this, guildId, djRoleId);
	}

	public async hasDJRole(guildId: string, member: GuildMember) {
		return playback.hasDJRole(this, guildId, member);
	}

	public async getRepeat(guildId: string): Promise<RepeatMode> {
		return playback.getRepeat(this, guildId);
	}

	public async setRepeat(guildId: string, repeat: RepeatMode) {
		return playback.setRepeat(this, guildId, repeat);
	}

	public async getRelated(guildId: string): Promise<boolean> {
		return playback.getRelated(this, guildId);
	}

	public async setRelated(guildId: string, related: boolean): Promise<boolean> {
		return playback.setRelated(this, guildId, related);
	}

	public async setDefaultTextChannel(guildId: string, textChannelId: string | null) {
		return channels.setDefaultTextChannel(this, guildId, textChannelId);
	}

	public async getDefaultTextChannel(guildId: string): Promise<string | null> {
		return channels.getDefaultTextChannel(this, guildId);
	}

	public async setDefaultVoiceChannel(guildId: string, voiceChannelId: string | null) {
		return channels.setDefaultVoiceChannel(this, guildId, voiceChannelId);
	}

	public async getDefaultVoiceChannel(guildId: string): Promise<string | null> {
		return channels.getDefaultVoiceChannel(this, guildId);
	}

	public async getPinnedChannel(guildId: string): Promise<string | null> {
		return channels.getPinnedChannel(this, guildId);
	}

	public async setPinnedChannel(guildId: string, channelId: string | null) {
		return channels.setPinnedChannel(this, guildId, channelId);
	}

	public async getPinnedChannelMode(guildId: string): Promise<PinnedChannelMode> {
		return channels.getPinnedChannelMode(this, guildId);
	}

	public async setPinnedChannelMode(guildId: string, mode: PinnedChannelMode) {
		return channels.setPinnedChannelMode(this, guildId, mode);
	}

	public async getPinnedChannelDeleteInput(guildId: string): Promise<boolean> {
		return channels.getPinnedChannelDeleteInput(this, guildId);
	}

	public async setPinnedChannelDeleteInput(guildId: string, deleteInput: boolean) {
		return channels.setPinnedChannelDeleteInput(this, guildId, deleteInput);
	}

	public async getJtcSettings(guildId: string) {
		return jtc.getJtcSettings(this, guildId);
	}

	public async setJtcEnabled(guildId: string, enabled: boolean) {
		return jtc.setJtcEnabled(this, guildId, enabled);
	}

	public async setJtcCategory(guildId: string, categoryId: string | null, markerChannelId: string | null) {
		return jtc.setJtcCategory(this, guildId, categoryId, markerChannelId);
	}

	public async setJtcTemplate(guildId: string, template: string) {
		return jtc.setJtcTemplate(this, guildId, template);
	}

	public async setJtcUserLimit(guildId: string, userLimit: number) {
		return jtc.setJtcUserLimit(this, guildId, userLimit);
	}

	public async getEnableController(guildId: string): Promise<boolean> {
		return playback.getEnableController(this, guildId);
	}

	public async setEnableController(guildId: string, enableController: boolean) {
		return playback.setEnableController(this, guildId, enableController);
	}

	public async getMixerSettings(guildId: string): Promise<MixerSettings> {
		return mixer.getMixerSettings(this, guildId);
	}

	public async setGapless(guildId: string, enabled: boolean) {
		return mixer.setGapless(this, guildId, enabled);
	}

	public async setNormalization(guildId: string, enabled: boolean) {
		return mixer.setNormalization(this, guildId, enabled);
	}

	public async setCrossfade(guildId: string, enabled: boolean, durationMs?: number) {
		return mixer.setCrossfade(this, guildId, enabled, durationMs);
	}

	public async getTtsAnnounceMode(guildId: string) {
		return playback.getTtsAnnounceMode(this, guildId);
	}

	public async setTtsAnnounceMode(guildId: string, mode: playback.TtsAnnounceMode) {
		return playback.setTtsAnnounceMode(this, guildId, mode);
	}

	public async getTtsParallel(guildId: string): Promise<boolean> {
		return playback.getTtsParallel(this, guildId);
	}

	public async setTtsParallel(guildId: string, enabled: boolean): Promise<boolean> {
		return playback.setTtsParallel(this, guildId, enabled);
	}

	public async setSponsorBlockSegments(guildId: string, segments: string[]): Promise<string[]> {
		return playback.setSponsorBlockSegments(this, guildId, segments);
	}

	public async getAiSettings(guildId: string) {
		return chatPolicy.getAiSettings(this, guildId);
	}

	public async getTtsSettings(guildId: string) {
		return chatPolicy.getTtsSettings(this, guildId);
	}

	public async getCustomCommandPrefix(guildId: string): Promise<string> {
		return chatPolicy.getCustomCommandPrefix(this, guildId);
	}

	public async getChatToolSettings(guildId: string) {
		return chatPolicy.getChatToolSettings(this, guildId);
	}

	public async setAiMode(guildId: string, mode: AiMode): Promise<AiMode> {
		return chatPolicy.setAiMode(this, guildId, mode);
	}

	/** 허용 채널 목록을 교체해요 (중복 제거) */
	public async setAiChannelIds(guildId: string, channelIds: string[]): Promise<string[]> {
		return chatPolicy.setAiChannelIds(this, guildId, channelIds);
	}

	/** 삭제된 채널을 허용 목록에서 제거해요 (모드는 그대로) */
	public async removeAiChannel(guildId: string, channelId: string): Promise<void> {
		return chatPolicy.removeAiChannel(this, guildId, channelId);
	}

	public async setChannelAiEnabled(
		guildId: string,
		channelId: string,
		enabled: boolean,
		allTextChannelIds: string[]
	): Promise<{ mode: AiMode; channelIds: string[] }> {
		return chatPolicy.setChannelAiEnabled(this, guildId, channelId, enabled, allTextChannelIds);
	}

	public async setChannelTtsEnabled(
		guildId: string,
		channelId: string,
		enabled: boolean,
		allTextChannelIds: string[]
	): Promise<{ mode: TtsMode; channelIds: string[] }> {
		return chatPolicy.setChannelTtsEnabled(this, guildId, channelId, enabled, allTextChannelIds);
	}

	public async setChannelChatToolEnabled(guildId: string, tool: ChatToolName, channelId: string, enabled: boolean, allTextChannelIds: string[]) {
		return chatPolicy.setChannelChatToolEnabled(this, guildId, tool, channelId, enabled, allTextChannelIds);
	}

	public async setCountingChannel(guildId: string, channelId: string | null) {
		return chatPolicy.setCountingChannel(this, guildId, channelId);
	}

	public async setCountingEnabled(guildId: string, enabled: boolean): Promise<boolean> {
		return chatPolicy.setCountingEnabled(this, guildId, enabled);
	}
}
