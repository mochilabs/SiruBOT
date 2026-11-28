import { describe, expect, it } from 'vitest';
import { collectPieces } from './pieceScan.testing.ts';

const KNOWN_DUPLICATES: string[] = [];

const EXPECTED_PIECES: string[] = [
	'commands:announce',
	'commands:avatar',
	'commands:checkin',
	'commands:delivery',
	'commands:dice',
	'commands:emojimaker',
	'commands:emojis',
	'commands:eval',
	'commands:favorites',
	'commands:giveaway',
	'commands:guess',
	'commands:help',
	'commands:info',
	'commands:invite',
	'commands:music',
	'commands:nodes',
	'commands:nowplaying',
	'commands:ohaasa',
	'commands:ping',
	'commands:play',
	'commands:playlist',
	'commands:privacy',
	'commands:profile',
	'commands:purge',
	'commands:queue',
	'commands:reload',
	'commands:rolepanel',
	'commands:rps',
	'commands:settings',
	'commands:shards',
	'commands:skip',
	'commands:stop',
	'commands:ticket',
	'commands:tts',
	'commands:weather',
	'commands:wrapped',
	'interaction-handlers:chapterSelectMenu',
	'interaction-handlers:chatCancel',
	'interaction-handlers:controllerButton',
	'interaction-handlers:controllerSelectMenu',
	'interaction-handlers:evalModal',
	'interaction-handlers:filterButton',
	'interaction-handlers:filterSelectMenu',
	'interaction-handlers:games',
	'interaction-handlers:giveawayButton',
	'interaction-handlers:onboardingButton',
	'interaction-handlers:panelIdleButton',
	'interaction-handlers:panelIdleSelect',
	'interaction-handlers:queueViewButton',
	'interaction-handlers:rolePanelButton',
	'interaction-handlers:settings',
	'interaction-handlers:settingsModal',
	'interaction-handlers:ticketButton',
	'interaction-handlers:ttsPanelButton',
	'interaction-handlers:ttsPanelSelect',
	'listeners:CoreInteractionCreate',
	'listeners:aiHistoryMessageBulkDeleted',
	'listeners:aiHistoryMessageDeleted',
	'listeners:aiHistoryMessageUpdated',
	'listeners:botProfileGuildCreate',
	'listeners:botProfileMemberUpdate',
	'listeners:botProfileReady',
	'listeners:channelDelete',
	'listeners:chatInputCommandDenied',
	'listeners:chatInputCommandError',
	'listeners:chatInputCommandSuccess',
	'listeners:chatTts',
	'listeners:clientReady',
	'listeners:commandChannel',
	'listeners:commandRegistrationAudit',
	'listeners:countingChannel',
	'listeners:customCommandPrefix',
	'listeners:customCommandSlash',
	'listeners:embedFix',
	'listeners:emojiEnlarge',
	'listeners:guildCreate',
	'listeners:guildDeleted',
	'listeners:guildMemberAdd',
	'listeners:guildMemberRemove',
	'listeners:interactionCreate',
	'listeners:interactionHandlerError',
	'listeners:listenerError',
	'listeners:mentionReply',
	'listeners:messageDeleted',
	'listeners:messageQuote',
	'listeners:raw',
	'listeners:rolePanelReactionAdd',
	'listeners:rolePanelReactionRemove',
	'listeners:shardDisconnect',
	'listeners:shardError',
	'listeners:shardReady',
	'listeners:shardReconnecting',
	'listeners:shardResume',
	'listeners:starboardReactionAdd',
	'listeners:starboardReactionRemove',
	'listeners:starboardReactionRemoveAll',
	'listeners:starboardReactionRemoveEmoji',
	'listeners:starboardSourceBulkDeleted',
	'listeners:starboardSourceDeleted',
	'listeners:tempVoiceChannelDelete',
	'listeners:tempVoiceReady',
	'listeners:tempVoiceState',
	'listeners:ttsMemberAnnounce',
	'listeners:voiceStateUpdate',
	'preconditions:DJOrAlone',
	'preconditions:ManageGuild',
	'preconditions:MemberListenable',
	'preconditions:ModuleEnabled',
	'preconditions:NodeAvailable',
	'preconditions:OwnerOnly',
	'preconditions:SameVoiceChannel',
	'preconditions:SongPlaying',
	'preconditions:TextChannelAllowed',
	'preconditions:VoiceConnected'
];

const EXPECTED_COMMAND_CATEGORIES: string[] = [
	'announce=일반',
	'avatar=일반',
	'checkin=게임',
	'delivery=일반',
	'dice=게임',
	'emojimaker=일반',
	'emojis=개발',
	'eval=개발',
	'favorites=음악',
	'giveaway=일반',
	'guess=게임',
	'help=일반',
	'info=일반',
	'invite=일반',
	'music=음악',
	'nodes=개발',
	'nowplaying=음악',
	'ohaasa=게임',
	'ping=일반',
	'play=음악',
	'playlist=음악',
	'privacy=일반',
	'profile=일반',
	'purge=일반',
	'queue=음악',
	'reload=개발',
	'rolepanel=일반',
	'rps=게임',
	'settings=일반',
	'shards=개발',
	'skip=음악',
	'stop=음악',
	'ticket=일반',
	'tts=일반',
	'weather=일반',
	'wrapped=개발'
];

describe('sapphire piece inventory', () => {
	const pieces = collectPieces();

	it('has no duplicate <store>:<name> (Sapphire overwrites silently)', () => {
		const seen = new Map<string, string>();
		const duplicates: string[] = [];
		for (const piece of pieces) {
			const previous = seen.get(piece.key);
			if (previous) duplicates.push(`${piece.key} (${previous}, ${piece.file})`);
			seen.set(piece.key, piece.file);
		}
		const unexpected = duplicates.filter((d) => !KNOWN_DUPLICATES.includes(d.split(' ')[0]));
		expect(unexpected).toEqual([]);
		const stale = KNOWN_DUPLICATES.filter((key) => !duplicates.some((d) => d.startsWith(`${key} `)));
		expect(stale, 'KNOWN_DUPLICATES entry is no longer duplicated, delete it').toEqual([]);
	});

	it('matches the committed snapshot of <store>:<name>', () => {
		expect(pieces.map((p) => p.key).sort()).toEqual(EXPECTED_PIECES);
	});

	it('command categories (explicit, or derived from the folder under commands/) match the snapshot', () => {
		const commands = pieces.filter((p) => p.key.startsWith('commands:'));
		expect(commands.map((p) => `${p.key.slice('commands:'.length)}=${p.category}`).sort()).toEqual(EXPECTED_COMMAND_CATEGORIES);
	});
});
