import { Message } from 'discord.js';
import { LavalinkManager, Player, PlayerJson, PlayerOptions } from 'lavalink-client';

type Chapter = {
	name: string;
	start: number;
	end: number;
	duration: number;
};

export type CustomPlayerJson = PlayerJson & {
	messageId: string | null;
};

export class CustomPlayer extends Player {
	public messageId: string | null = null;
	public controller: Message | null = null;
	public chapters: Chapter[] = [];
	public queuePage: number = 1;
	public activeFilters: string[] = [];

	constructor(options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) {
		super(options, LavalinkManager, dontEmitPlayerCreateEvent);
	}

	public override toJSON() {
		return {
			...super.toJSON(),
			messageId: this.messageId
		};
	}
}
