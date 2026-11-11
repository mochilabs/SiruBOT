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
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { PIECE_ROOTS } from './pieceRoots.ts';

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORES = ['commands', 'listeners', 'interaction-handlers', 'preconditions'] as const;
const PIECE_BASES = new Set(['Command', 'Subcommand', 'Listener', 'InteractionHandler', 'Precondition', 'AllFlowsPrecondition']);

interface Piece {
	/** `<스토어>:<이름>` */
	key: string;
	/** 커맨드만: 명시된 fullCategory. 옵션이 없으면 Sapphire가 폴더 구조에서 정하므로 `(folder:<commands 아래 하위 폴더>)`로 적어요 */
	category: string | null;
	file: string;
}

function walk(dir: string): string[] {
	const result: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) result.push(...walk(full));
		else result.push(full);
	}
	return result;
}

const stringProp = (obj: ts.ObjectLiteralExpression, prop: string): string | undefined => {
	for (const p of obj.properties) {
		if (ts.isPropertyAssignment(p) && p.name.getText() === prop && ts.isStringLiteralLike(p.initializer)) return p.initializer.text;
	}
	return undefined;
};

const arrayProp = (obj: ts.ObjectLiteralExpression, prop: string): string[] | undefined => {
	for (const p of obj.properties) {
		if (ts.isPropertyAssignment(p) && p.name.getText() === prop && ts.isArrayLiteralExpression(p.initializer)) {
			return p.initializer.elements.filter(ts.isStringLiteralLike).map((e) => e.text);
		}
	}
	return undefined;
};

/** 파일에서 export된 피스 클래스를 찾아 이름/카테고리를 읽어요 (`@ApplyOptions({...})` 또는 `super(context, {...})`). */
function readPieces(root: string, store: string, file: string): Piece[] {
	const base = path.basename(file, '.ts');
	const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
	const pieces: Piece[] = [];
	for (const node of source.statements) {
		if (!ts.isClassDeclaration(node) || !node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
		const extendsExpr = node.heritageClauses?.find((h) => h.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
		if (!extendsExpr || !PIECE_BASES.has(extendsExpr.getText())) continue;

		const optionObjects: ts.ObjectLiteralExpression[] = [];
		for (const decorator of ts.getDecorators(node) ?? []) {
			const call = decorator.expression;
			if (
				ts.isCallExpression(call) &&
				call.expression.getText() === 'ApplyOptions' &&
				call.arguments[0] &&
				ts.isObjectLiteralExpression(call.arguments[0])
			) {
				optionObjects.push(call.arguments[0]);
			}
		}
		const visit = (n: ts.Node): void => {
			if (
				ts.isCallExpression(n) &&
				n.expression.kind === ts.SyntaxKind.SuperKeyword &&
				n.arguments[1] &&
				ts.isObjectLiteralExpression(n.arguments[1])
			) {
				optionObjects.push(n.arguments[1]);
			}
			ts.forEachChild(n, visit);
		};
		visit(node);

		const name = optionObjects.map((o) => stringProp(o, 'name')).find((n) => n !== undefined) ?? base;
		const category = optionObjects.map((o) => arrayProp(o, 'fullCategory')).find((c) => c !== undefined);
		const derived = `(folder:${path
			.relative(path.join(SRC_ROOT, root, store), path.dirname(file))
			.split(path.sep)
			.join('/')})`;
		pieces.push({
			key: `${store}:${name}`,
			category: store === 'commands' ? (category?.join('/') ?? derived) : null,
			file: path.relative(SRC_ROOT, file)
		});
	}
	return pieces;
}

function collectPieces(): Piece[] {
	const pieces: Piece[] = [];
	for (const root of PIECE_ROOTS) {
		for (const store of STORES) {
			const dir = path.join(SRC_ROOT, root, store);
			let files: string[];
			try {
				files = walk(dir);
			} catch {
				continue;
			}
			for (const file of files) {
				const name = path.basename(file);
				if (!name.endsWith('.ts') || name.endsWith('.d.ts') || name.endsWith('.test.ts') || name.startsWith('_')) continue;
				pieces.push(...readPieces(root, store, file));
			}
		}
	}
	return pieces;
}

/**
 * 이름이 겹치는데 지금 그대로 배포되는 피스. 줄이기만 해요.
 * - listeners:rolePanelReaction: rolePanelReaction.ts의 Add/Remove 리스너 두 클래스가 모두 파일 이름을 이름으로 써서,
 *   나중에 로드된 쪽이 앞의 쪽을 unload해요 (Store.insert의 충돌 처리). 이동 PR은 동작을 바꾸지 않으므로 그대로 두고 여기 기록만 해요.
 *   해결하려면 두 리스너에 서로 다른 name 옵션을 주세요 (동작 변경이라 별도 PR).
 */
const KNOWN_DUPLICATES: string[] = ['listeners:rolePanelReaction'];

/** 이동 전 트리에서 만든 `<스토어>:<이름>` 스냅샷. 피스를 일부러 추가/삭제할 때만 고쳐요. */
const EXPECTED_PIECES: string[] = [
	'commands:avatar',
	'commands:chat-settings',
	'commands:chattools',
	'commands:checkin',
	'commands:delivery',
	'commands:dice',
	'commands:emojis',
	'commands:eval',
	'commands:favorites',
	'commands:guess',
	'commands:help',
	'commands:info',
	'commands:invite',
	'commands:mixer',
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
	'interaction-handlers:chatCancel',
	'interaction-handlers:controllerButton',
	'interaction-handlers:controllerSelectMenu',
	'interaction-handlers:evalModal',
	'interaction-handlers:filterButton',
	'interaction-handlers:filterSelectMenu',
	'interaction-handlers:games',
	'interaction-handlers:queueViewButton',
	'interaction-handlers:rolePanelButton',
	'interaction-handlers:settings',
	'interaction-handlers:settingsModal',
	'interaction-handlers:ticketButton',
	'interaction-handlers:ttsPanelButton',
	'interaction-handlers:ttsPanelSelect',
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
	'listeners:countingChannel',
	'listeners:customCommandPrefix',
	'listeners:customCommandSlash',
	'listeners:embedFix',
	'listeners:emojiEnlarge',
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
	'listeners:rolePanelReaction',
	'listeners:rolePanelReaction',
	'listeners:shardDisconnect',
	'listeners:shardError',
	'listeners:shardReady',
	'listeners:shardReconnecting',
	'listeners:shardResume',
	'listeners:tempVoiceChannelDelete',
	'listeners:tempVoiceReady',
	'listeners:tempVoiceState',
	'listeners:ttsMemberAnnounce',
	'listeners:voiceStateUpdate',
	'preconditions:ClientVoiceConnectable',
	'preconditions:ClientVoiceSpeakable',
	'preconditions:DJOrAlone',
	'preconditions:ManageGuild',
	'preconditions:MemberListenable',
	'preconditions:NodeAvailable',
	'preconditions:OwnerOnly',
	'preconditions:SameVoiceChannel',
	'preconditions:SongPlaying',
	'preconditions:TextChannelAllowed',
	'preconditions:VoiceConnected'
];

/** 커맨드 `<이름>=<fullCategory>` 스냅샷 (help 명령이 이 값으로 그룹을 나눠요). */
const EXPECTED_COMMAND_CATEGORIES: string[] = [
	'avatar=일반',
	'chat-settings=일반',
	'chattools=일반',
	'checkin=게임',
	'delivery=일반',
	'dice=게임',
	'emojis=개발',
	'eval=개발',
	'favorites=음악',
	'guess=게임',
	'help=(folder:)',
	'info=일반',
	'invite=일반',
	'mixer=음악',
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
	'weather=일반'
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
