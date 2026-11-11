import './environment.ts';
import '@sapphire/plugin-subcommands/register';

import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import * as colorette from 'colorette';
import { inspect } from 'util';
import { getConfig } from './config.ts';

export const setup = () => {
	ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(
		getConfig().registerCommands ? RegisterBehavior.Overwrite : RegisterBehavior.LogToConsole
	);

	inspect.defaultOptions.depth = 1;

	colorette.createColors({ useColor: true });
};
