import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import { GatewayDispatchEvents, type GatewayDispatchPayload } from 'discord.js';
import type { VoicePacket } from 'lavalink-client';

@ApplyOptions<Listener.Options>({ once: false })
export class RawEvent extends Listener {
	public override run(d: GatewayDispatchPayload): Promise<void> | void {
		switch (d.t) {
			case GatewayDispatchEvents.VoiceStateUpdate:
				if (!d.d.guild_id) return;
				if (
					d.d.user_id === this.container.client.user?.id &&
					d.d.channel_id === null &&
					this.container.audio?.getPlayer(d.d.guild_id)?.resettingVoice
				) {
					// 복구 중 의도한 퇴장에 라이브러리의 destroyPlayer/autoReconnect가 끼어들지 않게 한다.
					return;
				}
				// 라이브러리 타입은 Discord 퇴장 payload에 없는 Lavalink 내부 필드도 요구한다.
				return this.container.audio?.sendRawData(d as unknown as VoicePacket);
			case GatewayDispatchEvents.VoiceServerUpdate:
				if (d.d.endpoint === null) return;
				return this.container.audio?.sendRawData({ t: d.t, d: { ...d.d, endpoint: d.d.endpoint } });
			case GatewayDispatchEvents.ChannelDelete:
				if (!('guild_id' in d.d) || !d.d.guild_id) return;
				return this.container.audio?.sendRawData({ t: d.t, d: { guild_id: d.d.guild_id, id: d.d.id } });
		}
	}
}
