import './environment.ts';
import '@sapphire/plugin-subcommands/register';

import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import * as colorette from 'colorette';
import { inspect } from 'util';

export const setup = () => {
	ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
		process.env.REGISTER_COMMANDS === 'true' ? RegisterBehavior.Overwrite : RegisterBehavior.LogToConsole
	);

	inspect.defaultOptions.depth = 1;

	colorette.createColors({ useColor: true });
};

export default setup;
