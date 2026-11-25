/**
 * One table for help categories, usage metrics and per-server module toggling. The dashboard imports it via the `@sirubot/utils/modules` subpath.
 * - `commands`: slash command piece `name`s (English); a bot test checks them against the real pieces.
 * - `componentNamespaces`: `defineCustomId` namespaces, used to group button/select usage by module.
 * - `messageFeatures`: features driven by messages or events rather than commands; metric key `msg:{id}`.
 */

export type BotModuleId = 'music' | 'community' | 'ai' | 'fun' | 'utility' | 'admin';

export interface MessageFeature {
	readonly id: string;
	readonly summary: string;
}

export interface BotModule {
	readonly id: BotModuleId;
	readonly label: string;
	readonly emoji: string;
	/** App emoji name inside Discord (`emoji(name, fallback)`); the dashboard uses the unicode `emoji`. */
	readonly appEmoji: string;
	/** Help select description, 100 characters max. */
	readonly description: string;
	readonly commands: readonly string[];
	readonly componentNamespaces: readonly string[];
	readonly messageFeatures: readonly MessageFeature[];
	/** The management module can't be turned off. */
	readonly toggleable: boolean;
}

export const BOT_MODULES: readonly BotModule[] = [
	{
		id: 'music',
		label: '음악',
		emoji: '🎵',
		appEmoji: 'music_note',
		description: '음성 채널에서 노래 재생, 대기열, 플레이리스트',
		commands: ['music', 'play', 'skip', 'stop', 'nowplaying', 'queue', 'playlist', 'favorites'],
		componentNamespaces: ['controller', 'filter', 'search', 'library', 'playlist-add', 'skip-vote', 'queue'],
		messageFeatures: [{ id: 'music-channel', summary: '음악 고정 채널에 곡 이름이나 링크를 쓰면 바로 재생해요' }],
		toggleable: true
	},
	{
		id: 'community',
		label: '커뮤니티',
		emoji: '🏡',
		appEmoji: 'people',
		description: '역할 패널, 티켓, 프로필, 출석, 나눔, 인사 메시지',
		commands: ['rolepanel', 'ticket', 'profile', 'checkin', 'announce', 'giveaway'],
		componentNamespaces: ['role-panel', 'ticket', 'giveaway'],
		messageFeatures: [
			{ id: 'greeting', summary: '새 멤버가 오고 갈 때 인사 메시지와 카드를 보내요' },
			{ id: 'counting', summary: '카운팅 채널에서 다 같이 숫자를 이어 세요' },
			{ id: 'birthday', summary: '생일을 켠 멤버를 정해진 시각에 카드와 함께 축하해요' },
			{ id: 'starboard', summary: '반응이 많이 달린 메시지를 스타보드 채널에 모아요' },
			{ id: 'custom-command', summary: '서버가 만든 커스텀 명령에 답해요' },
			{ id: 'temp-voice', summary: '입장용 음성 채널에 들어가면 내 음성 채널을 만들어 줘요' }
		],
		toggleable: true
	},
	{
		id: 'ai',
		label: 'AI·TTS',
		emoji: '🤖',
		appEmoji: 'robot',
		description: 'AI 대화, 채팅 읽어주기, 이모지 만들기',
		commands: ['tts', 'emojimaker'],
		componentNamespaces: ['chat-cancel', 'tts', 'moji'],
		messageFeatures: [
			{ id: 'ai-mention', summary: '채팅에서 저를 멘션하면 AI가 대답해요' },
			{ id: 'chat-tts', summary: 'TTS 채널에 쓴 채팅을 음성 채널에서 읽어줘요' }
		],
		toggleable: true
	},
	{
		id: 'fun',
		label: '놀이',
		emoji: '🎲',
		appEmoji: 'gamepad',
		description: '주사위, 가위바위보, 숫자 맞히기, 오늘의 운세',
		commands: ['dice', 'guess', 'rps', 'ohaasa'],
		componentNamespaces: ['game'],
		messageFeatures: [],
		toggleable: true
	},
	{
		id: 'utility',
		label: '유틸',
		emoji: '🧰',
		appEmoji: 'tools',
		description: '날씨, 택배 조회, 아바타, 봇·서버 정보',
		commands: ['avatar', 'delivery', 'info', 'invite', 'ping', 'weather', 'privacy', 'help'],
		componentNamespaces: ['help', 'onboarding'],
		messageFeatures: [
			{ id: 'emoji-enlarge', summary: '이모지 하나만 보내면 크게 보여줘요' },
			{ id: 'message-quote', summary: '메시지 링크를 붙이면 내용을 인용해 보여줘요' },
			{ id: 'embed-fix', summary: 'X·인스타 같은 링크의 미리보기를 고쳐줘요' }
		],
		toggleable: true
	},
	{
		id: 'admin',
		label: '관리',
		emoji: '🛠️',
		appEmoji: 'shield',
		description: '서버 설정(믹서·AI 채팅·채팅 유틸 포함), 메시지 청소',
		commands: ['settings', 'purge'],
		componentNamespaces: ['settings', 'confirm'],
		messageFeatures: [],
		toggleable: false
	}
];

const MODULE_BY_ID = new Map(BOT_MODULES.map((m) => [m.id, m]));
const MODULE_BY_COMMAND = new Map(BOT_MODULES.flatMap((m) => m.commands.map((c) => [c, m.id] as const)));
const MODULE_BY_NAMESPACE = new Map(BOT_MODULES.flatMap((m) => m.componentNamespaces.map((n) => [n, m.id] as const)));
const MODULE_BY_MESSAGE_FEATURE = new Map(BOT_MODULES.flatMap((m) => m.messageFeatures.map((f) => [f.id, m.id] as const)));

export function getBotModule(id: BotModuleId): BotModule {
	const found = MODULE_BY_ID.get(id);
	if (!found) throw new Error(`unknown bot module: ${id}`);
	return found;
}

export function commandModule(commandName: string): BotModuleId | null {
	return MODULE_BY_COMMAND.get(commandName) ?? null;
}

/** 모듈이 꺼져 있어도 항상 실행되는 슬래시 명령 — 도움말은 끈 뒤에도 켜는 방법을 알려줘야 하고, 개인정보 삭제는 막을 수 없어요. */
export const ALWAYS_ALLOWED_COMMANDS: readonly string[] = ['help', 'privacy'];
export const ALWAYS_ALLOWED_NAMESPACES: readonly string[] = ['help', 'onboarding'];

/** Drops unknown ids and non-disableable modules, dedupes, and orders by the module table. */
export function sanitizeDisabledModules(input: readonly string[] | null | undefined): BotModuleId[] {
	const wanted = new Set(input ?? []);
	return BOT_MODULES.filter((m) => m.toggleable && wanted.has(m.id)).map((m) => m.id);
}

/** A non-disableable module counts as on even if listed. */
export function isModuleDisabled(disabledModules: readonly string[] | null | undefined, moduleId: BotModuleId): boolean {
	return getBotModule(moduleId).toggleable && (disabledModules ?? []).includes(moduleId);
}

export function gatedModuleForCommand(commandName: string): BotModuleId | null {
	if (ALWAYS_ALLOWED_COMMANDS.includes(commandName)) return null;
	return MODULE_BY_COMMAND.get(commandName) ?? null;
}

export function gatedModuleForNamespace(namespace: string): BotModuleId | null {
	if (ALWAYS_ALLOWED_NAMESPACES.includes(namespace)) return null;
	return MODULE_BY_NAMESPACE.get(namespace) ?? null;
}

export function messageFeatureModule(featureId: string): BotModuleId | null {
	return MODULE_BY_MESSAGE_FEATURE.get(featureId) ?? null;
}

export function moduleDisabledMessage(moduleId: BotModuleId): string {
	return `이 서버에서는 ${getBotModule(moduleId).label} 기능이 꺼져 있어요. 관리자는 /설정에서 켤 수 있어요.`;
}

/** 사용 지표 feature 키 접두어. `cmd:music.play`, `ns:controller`, `msg:greeting`, `playback:track_error`, `onboarding:sent` */
export const USAGE_FEATURE_PREFIXES = ['cmd', 'ns', 'msg', 'playback', 'onboarding'] as const;
export type UsageFeaturePrefix = (typeof USAGE_FEATURE_PREFIXES)[number];

/** Fits the DB column. */
export const USAGE_FEATURE_MAX_LENGTH = 64;

export function usageFeatureKey(prefix: UsageFeaturePrefix, name: string): string {
	return `${prefix}:${name}`.slice(0, USAGE_FEATURE_MAX_LENGTH);
}

/** Playback failures group under music, onboarding under util; null for unknown keys. */
export function featureModule(feature: string): BotModuleId | null {
	const sep = feature.indexOf(':');
	if (sep < 0) return null;
	const prefix = feature.slice(0, sep);
	const rest = feature.slice(sep + 1);
	switch (prefix) {
		case 'cmd':
			return commandModule(rest.split('.')[0] ?? '');
		case 'ns':
			return MODULE_BY_NAMESPACE.get(rest) ?? null;
		case 'msg':
			return MODULE_BY_MESSAGE_FEATURE.get(rest) ?? null;
		case 'playback':
			return 'music';
		case 'onboarding':
			return 'utility';
		default:
			return null;
	}
}
