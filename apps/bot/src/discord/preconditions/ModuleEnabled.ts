import { AllFlowsPrecondition } from '@sapphire/framework';
import type { CommandInteraction, ContextMenuCommandInteraction, Message } from 'discord.js';
import { gateCommand } from '../../lib/moduleGate.ts';
import { isModuleEnabled } from '../../services/guildSettings/modules.ts';

export class ModuleEnabledPrecondition extends AllFlowsPrecondition {
	public constructor(context: AllFlowsPrecondition.LoaderContext, options: AllFlowsPrecondition.Options) {
		// 20: 내장 Enabled(10) 다음, 명령별 precondition보다 먼저 실행돼요.
		super(context, { ...options, position: 20 });
	}

	public override chatInputRun(interaction: CommandInteraction) {
		return this.check(interaction.commandName, interaction.guildId);
	}

	public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
		return this.check(interaction.commandName, interaction.guildId);
	}

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
