import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { gateCommand } from '../../lib/moduleGate.ts';
import { isModuleEnabled } from '../../services/guildSettings/modules.ts';

/**
 * 전역 precondition(position 지정) — 모든 명령에 자동으로 붙어요. 서버에서 꺼진 모듈의 슬래시 명령은 실행 전에 거절해요.
 * 명령 이름 → 모듈 대응은 `@sirubot/utils/modules`가 정하고, 도움말은 항상 허용해요 (D-7).
 * 거절 문구는 `chatInputCommandDenied`가 ephemeral로 보내요.
 */
export class ModuleEnabledPrecondition extends AllFlowsPrecondition {
	public constructor(context: AllFlowsPrecondition.LoaderContext, options: AllFlowsPrecondition.Options) {
		// 20: 내장 Enabled(10) 다음. 명령별 precondition보다 먼저 돌아서 꺼진 기능은 권한·음성 채널 검사 전에 거절돼요.
		super(context, { ...options, position: 20 });
	}

	public override chatInputRun(interaction: CommandInteraction) {
		return this.check(interaction.commandName, interaction.guildId);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.check(interaction.commandName, interaction.guildId);
	}

	// 메시지 명령(접두사)은 커스텀 명령 리스너가 따로 처리해요
	public override messageRun(_message: Message) {
		return this.ok();
	}

	private async check(commandName: string, guildId: string | null) {
		const result = await gateCommand(commandName, (moduleId) => isModuleEnabled(this.container.guildService, guildId, moduleId));
		return result.allowed
			? this.ok()
			: this.error({ identifier: 'ModuleDisabled', message: result.message, context: { moduleId: result.moduleId } });
	}
}
