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
	private chapters: Chapter[] = [];
	private messageId: string | null = null;
	private controller: Message | null = null;

	constructor(options: PlayerOptions, LavalinkManager: LavalinkManager, dontEmitPlayerCreateEvent?: boolean) {
		super(options, LavalinkManager, dontEmitPlayerCreateEvent);
	}

	public getCurrentChapter() {
		return this.chapters.find((chapter) => chapter.start <= this.position && chapter.end >= this.position);
	}

	public setChapters(chapters: Chapter[]) {
		this.chapters = chapters;
	}

	public getController() {
		return this.controller;
	}

	public setController(controller: Message) {
		this.messageId = controller.id;
		this.controller = controller;
	}

	public getMessageId() {
		return this.messageId;
	}

	public override toJSON() {
		return {
			...super.toJSON(),
			messageId: this.messageId
		};
	}
}
