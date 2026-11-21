/**
 * 봇 기능 모듈 정의 — 도움말 카테고리, 사용 지표 집계, (2단계) 서버별 모듈 켜기/끄기가 같은 표를 써요.
 * 봇과 대시보드가 함께 쓰는 계약이라 여기 한 곳에만 둬요. 대시보드는 `@sirubot/utils/modules` 서브패스로 import해요.
 *
 * - `commands`: 슬래시 명령 piece의 `name`(영어 이름). 봇 테스트가 실제 command piece와 대조해요.
 * - `componentNamespaces`: `defineCustomId`의 namespace. 버튼·셀렉트 사용량을 모듈로 묶을 때 써요.
 * - `messageFeatures`: 명령 없이 메시지·이벤트로 동작하는 기능. 지표 키는 `msg:{id}`예요.
 */

export type BotModuleId = 'music' | 'community' | 'ai' | 'fun' | 'utility' | 'admin';

export interface MessageFeature {
	readonly id: string;
	/** 도움말 카테고리 화면에 보여줄 한 줄 설명 */
	readonly summary: string;
}

export interface BotModule {
	readonly id: BotModuleId;
	readonly label: string;
	readonly emoji: string;
	/** 도움말 셀렉트 설명 (100자 이하) */
	readonly description: string;
	readonly commands: readonly string[];
	readonly componentNamespaces: readonly string[];
	readonly messageFeatures: readonly MessageFeature[];
	/** 서버 관리자가 끌 수 있는 모듈인지 (2단계 P-06). 관리 모듈은 끌 수 없어요. */
	readonly toggleable: boolean;
}

export const BOT_MODULES: readonly BotModule[] = [
	{
		id: 'music',
		label: '음악',
		emoji: '🎵',
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
		description: '역할 패널, 티켓, 프로필, 출석, 인사 메시지',
		commands: ['rolepanel', 'ticket', 'profile', 'checkin'],
		componentNamespaces: ['role-panel', 'ticket'],
		messageFeatures: [
			{ id: 'greeting', summary: '새 멤버가 오고 갈 때 인사 메시지와 카드를 보내요' },
			{ id: 'counting', summary: '카운팅 채널에서 다 같이 숫자를 이어 세요' },
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
		description: '서버 설정, 메시지 청소, 믹서와 AI 채팅 설정',
		commands: ['settings', 'purge', 'mixer', 'chat-settings', 'chattools'],
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

/* ---------------------------------------------------------------- 사용 지표 키 */

/** 사용 지표 feature 키 접두어. `cmd:music.play`, `ns:controller`, `msg:greeting`, `playback:track_error`, `onboarding:sent` */
export const USAGE_FEATURE_PREFIXES = ['cmd', 'ns', 'msg', 'playback', 'onboarding'] as const;
export type UsageFeaturePrefix = (typeof USAGE_FEATURE_PREFIXES)[number];

/** DB 컬럼 길이 안에 들어가도록 feature 키는 64자로 잘라요 */
export const USAGE_FEATURE_MAX_LENGTH = 64;

export function usageFeatureKey(prefix: UsageFeaturePrefix, name: string): string {
	return `${prefix}:${name}`.slice(0, USAGE_FEATURE_MAX_LENGTH);
}

/** 지표 feature 키를 모듈로 바꿔요. 재생 실패는 음악, 온보딩은 유틸로 묶어요. 모르는 키는 null. */
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
