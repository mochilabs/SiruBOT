import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { emoji } from '@sirubot/utils';
import { MUSIC_ACCESS_MESSAGES } from '../../../features/music/application/access.ts';

export class MemberListenable extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return `${emoji('volume_muted')} 음성 채널에서 듣기 상태가 꺼져있어요. 듣기 상태를 켜주세요.`;
	}
	#ephemeral = true;

	public check(member: GuildMember | null) {
		if (!member?.voice.channelId) return false;
		return !member.voice.deaf;
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.check(interaction.member)) {
			return this.createError(interaction.member);
		}

		return this.ok();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.check(interaction.member)) {
			return this.createError(interaction.member);
		}

		return this.ok();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		if (!this.check(message.member)) {
			return this.createError(message.member);
		}

		return this.ok();
	}

	/** 음성 채널에 없어서 실패한 경우(원격 권한자가 채널 밖에서 듣기 전제 명령을 쓴 경우)엔 듣기 안내 대신 음성 채널 접속 안내를 보여줘요. */
	private createError(member?: GuildMember | null) {
		const message = member && !member.voice.channelId ? MUSIC_ACCESS_MESSAGES.voiceRequired() : this.#message;
		return this.error({ message, context: { ephemeral: this.#ephemeral } });
	}
}
