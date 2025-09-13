import './environment.ts';
import '@sapphire/plugin-api/register';
import '@sapphire/plugin-subcommands/register';

import { ApplicationCommandRegistries, RegisterBehavior } from '@sapphire/framework';
import * as colorette from 'colorette';
import { inspect } from 'util';

export const setup = () => {
	// Set default behavior to bulk overwrite
	ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

	// Set default inspection depth
	inspect.defaultOptions.depth = 1;

	// Enable colorette
	colorette.createColors({ useColor: true });
};

export default setup;
