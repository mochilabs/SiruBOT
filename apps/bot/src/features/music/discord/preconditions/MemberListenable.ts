import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction, ContextMenuCommandInteraction, GuildMember, Message } from 'discord.js';
import { emoji } from '@sirubot/utils';

export class MemberListenable extends AllFlowsPrecondition {
	// 클래스 필드 대신 getter로 렌더 시점에 평가해야 앱 이모지 매핑이 반영돼요.
	get #message() {
		return `${emoji('volume_muted')} 음성 채널에서 듣기 상태가 꺼져있어요. 듣기 상태를 켜주세요.`;
	}
	#ephemeral = true;

	/**
	 * 음성 채널에 들어가 있으면 듣기 상태(서버 음소거 아님)를 봐요.
	 * 음성 채널 밖이면 통과해요 — 접속 여부와 원격 권한자 예외는 음성 프리컨디션이나 음악 유스케이스가 판정해요.
	 */
	public check(member: GuildMember | null) {
		if (!member) return false;
		if (!member.voice.channelId) return true;
		return !member.voice.deaf;
	}

	public override chatInputRun(interaction: CommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.check(interaction.member)) {
			return this.createError();
		}

		return this.ok();
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		if (!interaction.inCachedGuild()) return this.createError();

		if (!this.check(interaction.member)) {
			return this.createError();
		}

		return this.ok();
	}

	public override messageRun(message: Message) {
		if (!message.inGuild()) return this.createError();

		if (!this.check(message.member)) {
			return this.createError();
		}

		return this.ok();
	}

	private createError() {
		return this.error({ message: this.#message, context: { ephemeral: this.#ephemeral } });
	}
}
