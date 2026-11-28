import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { ChannelType, Message } from 'discord.js';
import { isChannelToggleEnabled } from '../../../../services/guildService.ts';
import { preprocessTtsMessage } from '../../application/chatTts.ts';
import type { CustomPlayer } from '../../../music/index.ts';
import { isMessageFeatureEnabled } from '../../../../services/guildSettings/modules.ts';
import * as guildChatPolicy from '../../../../services/guildSettings/chatPolicy.ts';
import { usageFeatureKey } from '@sirubot/utils/modules';

@ApplyOptions<Listener.Options>({
	event: Events.MessageCreate
})
export class ChatTtsListener extends Listener {
	public override async run(message: Message): Promise<void> {
		try {
			await this.handle(message);
		} catch (error) {
			this.container.logger.error(`[chatTts] unhandled error (guild ${message.guildId}): ${error}`);
		}
	}

	private async handle(message: Message): Promise<void> {
		if (!message.inGuild() || message.author.bot || message.webhookId) return;
		if (message.channel.type !== ChannelType.GuildText) return;

		const content = message.content?.trim();
		if (!content) return;
		if (!(await isMessageFeatureEnabled(this.container.guildService, message.guildId, 'chat-tts'))) return;

		// 봇이 음성에 연결돼 있을 때만 읽는다 — 자동 조인은 하지 않는다 (명세 4.1)
		const player = this.container.audio.getPlayer(message.guildId) as CustomPlayer | null | undefined;
		if (!player?.voiceChannelId || !player.connected) return;

		// 정책: 길드 켜짐 + siru_tts 설정 — 채널은 허용 목록이거나 이 플레이어 세션의 텍스트 채널이면 된다
		if (!this.container.ttsService.isEnabled()) return;
		const settings = await guildChatPolicy.getTtsSettings(this.container.guildService, message.guildId);
		const isSessionChannel = settings.mode !== 'off' && player.textChannelId === message.channelId;
		if (!isSessionChannel && !isChannelToggleEnabled(settings, message.channelId)) return;

		// 사용자 opt-in: /tts on으로 낭독 대상에 포함된 사용자만 읽는다
		const preset = await this.container.ttsUserSettings.get(message.guildId, message.author.id);
		if (!preset.enabled) return;

		// 접두사(기본 '!')·슬래시 명령어는 읽지 않는다
		const prefix = await guildChatPolicy.getCustomCommandPrefix(this.container.guildService, message.guildId);
		if (content.startsWith(prefix) || content.startsWith('/')) return;

		// 전처리 후 비어 있으면(첨부/스티커만 있는 메시지 등) 무시한다
		const text = preprocessTtsMessage(message);
		if (!text) return;

		this.container.usageRecorder?.record(message.guildId, usageFeatureKey('msg', 'chat-tts'), message.author.id);
		await this.container.chatTtsService.handleMessage(message, text, preset);
	}
}
