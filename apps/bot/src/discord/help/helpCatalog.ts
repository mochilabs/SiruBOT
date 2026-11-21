import { BOT_MODULES, getBotModule, type BotModule, type BotModuleId } from '@sirubot/utils/modules';
import type { ApplicationCommand } from 'discord.js';
import { MUSIC_PROMOTED_COMMANDS, MUSIC_SUBCOMMANDS } from '../../features/music/index.ts';
import { commandMention } from '../../lib/commandMention.ts';
import { INFO_SUBCOMMANDS } from '../commands/info.ts';
import * as avatar from '../subcommands/avatar.ts';

/**
 * `/도움말` 카테고리 데이터 — 카테고리 묶음은 `@sirubot/utils/modules`의 BOT_MODULES를 그대로 써요 (지표·모듈 설정과 같은 표).
 * 명령 설명은 각 명령의 한국어 설명(ko 현지화)과 같은 문장이에요. Sapphire `description`은 영어라 쓰지 않아요.
 * `helpCatalog.test.ts`가 BOT_MODULES의 명령이 실제 피스인지, 공개 명령이 빠짐없이 들어 있는지 확인해요.
 */
export const HELP_COMMAND_SUMMARIES: Readonly<Record<string, string>> = {
	// 음악 (music·play·skip·stop은 서브커맨드 카탈로그에서 그려요)
	nowplaying: '현재 재생 중인 곡의 정보를 보여줘요.',
	queue: '음악 대기열을 보거나 관리해요.',
	playlist: '커스텀 플레이리스트를 관리해요.',
	favorites: '즐겨찾기를 관리해요.',
	// 커뮤니티
	rolepanel: '역할 패널을 관리해요.',
	ticket: '고객지원 및 문의 티켓 시스템을 관리해요.',
	profile: '프로필(생일·별자리·음악 기록)을 확인하고 관리해요.',
	checkin: '매일 출석 체크를 해요. 연속 출석하면 스트릭이 쌓여요.',
	// AI·TTS
	tts: '채널 낭독 on/off와 내 TTS 설정을 관리해요.',
	emojimaker: '설명이나 이미지로 픽셀 이모지를 그려 주고, 마음에 드는 걸 서버 이모지로 등록해요.',
	// 놀이
	dice: '주사위를 굴려요. 기본은 1d6이고, 개수·면·보정을 옵션으로 지정할 수 있어요.',
	guess: '1~100 숫자를 맞히는 게임이에요. 6번 안에 맞히면 이겨요!',
	rps: '가위바위보로 봇과 승부해요.',
	ohaasa: '일본 아사히 방송의 오늘 별자리 운세를 확인해요.',
	// 유틸
	avatar: avatar.description,
	delivery: '택배 배송 상태를 조회해요.',
	info: '봇·서버·유저 정보를 보여줘요.',
	invite: '봇 초대 링크를 보여줘요.',
	ping: '봇과 각 구간의 연결 상태를 보여드려요.',
	weather: '현재 날씨와 예보를 확인해요.',
	privacy: '내 데이터를 확인하거나 지워요. (AI 기억·프로필·게임 전적)',
	help: '사용 가능한 명령어 목록을 보여줘요.',
	// 관리
	settings: '봇의 서버 설정을 관리해요.',
	purge: '최근 14일 이내의 메시지를 확인 후 삭제해요.',
	mixer: '믹서 설정과 상태를 보여줘요.',
	'chat-settings': 'AI 사용 범위와 현재 채널 상태를 확인해요.',
	chattools: '이 채널에서 채팅 유틸 기능을 켜거나 꺼요.'
};

/** 서브커맨드나 승격 명령으로 따로 그리는 명령 */
const MUSIC_PROMOTED_NAMES = new Set(MUSIC_PROMOTED_COMMANDS.map((c) => c.name));

export interface HelpContext {
	/** 등록된 명령 ID 색인 (`fetchCommandIndex`). 비어 있으면 멘션 대신 인라인 코드로 보여요. */
	index: ReadonlyMap<string, ApplicationCommand>;
	/** 이 프로세스에 로드된 명령 이름. env가 없어 꺼진 명령(tts, emojimaker 등)은 빠져요. */
	loadedCommands: ReadonlySet<string>;
	/** ManageGuild 권한이 있으면 관리 카테고리를 보여줘요 */
	canManageGuild: boolean;
	/** (2단계 P-06) 서버에서 꺼진 모듈을 빼요. 지금은 항상 true예요. */
	isModuleEnabled?: (moduleId: BotModuleId) => boolean;
}

/** 이 사람이 고를 수 있는 카테고리 (셀렉트 선택지 순서) */
export function visibleHelpModules(ctx: Pick<HelpContext, 'canManageGuild' | 'isModuleEnabled'>): BotModule[] {
	return BOT_MODULES.filter((m) => (m.id !== 'admin' || ctx.canManageGuild) && (ctx.isModuleEnabled?.(m.id) ?? true));
}

function subcommandMention(commandName: string, subcommandName: string, index: ReadonlyMap<string, ApplicationCommand>): string {
	const command = index.get(commandName);
	return command ? `</${commandName} ${subcommandName}:${command.id}>` : `\`/${commandName} ${subcommandName}\``;
}

/** 카테고리 한 개의 본문 줄 (명령 목록 + 메시지로 쓰는 기능) */
export function helpCategoryLines(moduleId: BotModuleId, ctx: HelpContext): string[] {
	const module = getBotModule(moduleId);
	const lines: string[] = [];

	for (const name of module.commands) {
		if (!ctx.loadedCommands.has(name)) continue;
		if (name === 'music') {
			for (const promoted of MUSIC_PROMOTED_COMMANDS) {
				if (ctx.loadedCommands.has(promoted.name)) lines.push(`${commandMention(promoted.name, ctx.index)} · ${promoted.description}`);
			}
			for (const sub of MUSIC_SUBCOMMANDS) lines.push(`　└ ${subcommandMention('music', sub.name, ctx.index)} · ${sub.description}`);
			continue;
		}
		if (MUSIC_PROMOTED_NAMES.has(name)) continue;
		lines.push(`${commandMention(name, ctx.index)} · ${HELP_COMMAND_SUMMARIES[name] ?? ''}`.trimEnd());
		if (name === 'info') {
			for (const sub of INFO_SUBCOMMANDS) lines.push(`　└ ${subcommandMention('info', sub.name, ctx.index)} · ${sub.description}`);
		}
	}

	if (module.messageFeatures.length > 0) {
		lines.push('', '**명령 없이 쓰는 기능**');
		for (const feature of module.messageFeatures) lines.push(`- ${feature.summary}`);
	}
	return lines;
}
