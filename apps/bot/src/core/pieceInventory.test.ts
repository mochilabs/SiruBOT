/**
 * Sapphire 피스 인벤토리 안전망.
 *
 * 부팅 때 스토어가 읽는 피스(commands/listeners/interaction-handlers/preconditions)를 소스 트리에서 같은 규칙으로 계산해,
 * 아래 스냅샷과 비교해요. 파일을 옮겨도 `<스토어>:<피스 이름>` 집합이 같아야 통과해요 (경로는 스냅샷에 없어요).
 *
 * Sapphire 규칙 (@sapphire/pieces LoaderStrategy, @sapphire/framework Command):
 * - 루트(PIECE_ROOTS) 바로 아래 스토어 폴더를 재귀로 읽고, `_`로 시작하는 파일과 `.d.ts`는 건너뛰어요.
 * - 파일이 export한 피스 클래스마다 피스가 하나 생겨요. 이름은 옵션 `name`, 없으면 파일 이름(확장자 제외)이에요.
 * - 커맨드의 fullCategory는 옵션이 없으면 폴더 구조에서 나와요. 폴더 이동이 카테고리를 바꾸지 않게 모든 커맨드가 명시해야 해요.
 * - 같은 `<스토어>:<이름>`이 둘이면 Sapphire가 조용히 덮어써요. 중복은 실패 처리해요.
 *
 * Sapphire 로더로 직접 피스를 로드하는 테스트는 만들지 않았어요: 피스 모듈이 prisma/lavalink/redis 등 무거운 의존성을 import해서 목이 과해져요.
 */
import { describe, expect, it } from 'vitest';
import { collectPieces } from './pieceScan.testing.ts';

/** 이름이 겹치는데 지금 그대로 배포되는 피스. 줄이기만 해요 (현재 없음). */
const KNOWN_DUPLICATES: string[] = [];

/** 이동 전 트리에서 만든 `<스토어>:<이름>` 스냅샷. 피스를 일부러 추가/삭제할 때만 고쳐요. */
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
	'interaction-handlers:chatCancel',
	'interaction-handlers:controllerButton',
	'interaction-handlers:controllerSelectMenu',
	'interaction-handlers:evalModal',
	'interaction-handlers:filterButton',
	'interaction-handlers:filterSelectMenu',
	'interaction-handlers:games',
	'interaction-handlers:giveawayButton',
	'interaction-handlers:onboardingButton',
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

/** 커맨드 `<이름>=<fullCategory>` 스냅샷 (help 명령이 이 값으로 그룹을 나눠요). */
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
