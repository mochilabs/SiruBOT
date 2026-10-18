import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ChannelType, Message } from 'discord.js';
import { isTtsEnabled } from '../../../services/guildService.ts';
import { preprocessTtsMessage } from '../../../services/chatTts.ts';
import type { CustomPlayer } from '../lavalink/player/customPlayer.ts';

/**
 * 채팅 TTS 리스너 — 설정된 채널의 메시지를 음성으로 읽는다 (명세 4.1 트리거).
 * 권한 제한은 없다: 봇이 음성에 연결돼 있을 때만, 명령어 형태가 아닌 메시지를 읽는다.
 * 전처리·병합·스로틀·모드 결정은 ChatTtsService가 담당한다.
 */
@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class ChatTtsListener extends Listener {
	public override async run(message: Message): Promise<void> {
		try {
			await this.handle(message);
		} catch (error) {
			// 채팅 읽기 실패는 조용히 스킵한다 (명세 4.6) — 채널 공지 없음
			this.container.logger.error(`[chatTts] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}

	private async handle(message: Message): Promise<void> {
		if (!message.inGuild() || message.author.bot || message.webhookId) return;
		if (message.channel.type !== ChannelType.GuildText) return;

		const content = message.content?.trim();
		if (!content) return;

		// 정책: 길드/채널 켜짐 + siru_tts 설정
		if (!this.container.ttsService.isEnabled()) return;
		const settings = await this.container.guildService.getTtsSettings(message.guildId);
		if (!isTtsEnabled(settings, message.channelId)) return;

		// 사용자 opt-in: /tts on으로 낭독 대상에 포함된 사용자만 읽는다
		const preset = await this.container.ttsUserSettings.get(message.guildId, message.author.id);
		if (!preset.enabled) return;

		// 봇이 음성에 연결돼 있을 때만 읽는다 — 자동 조인은 하지 않는다 (명세 4.1)
		const player = this.container.audio.getPlayer(message.guildId) as CustomPlayer | null | undefined;
		if (!player?.voiceChannelId || !player.connected) return;

		// 접두사(기본 '!')·슬래시 명령어는 읽지 않는다
		const prefix = await this.container.guildService.getCustomCommandPrefix(message.guildId);
		if (content.startsWith(prefix) || content.startsWith('/')) return;

		// 전처리 후 비어 있으면(첨부/스티커만 있는 메시지 등) 무시한다
		const text = preprocessTtsMessage(message);
		if (!text) return;

		await this.container.chatTtsService.handleMessage(message, text, preset);
	}
}
