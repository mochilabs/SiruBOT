/**
 * SiruBOT Slash Command Registration Script
 *
 * 수동으로 모든 슬래시 커맨드를 Discord에 등록합니다.
 * 개발 서버(guild)에 즉시 등록하거나 전역 등록할 수 있습니다.
 *
 * 사용법:
 *   npx tsx scripts/register-commands.ts              # DEV_GUILD_IDS에 등록
 *   npx tsx scripts/register-commands.ts --global      # 전역 등록
 *   npx tsx scripts/register-commands.ts --guild 1234  # 특정 길드에 등록
 *   npx tsx scripts/register-commands.ts --dry         # 등록 없이 명령어 목록만 출력
 *   npx tsx scripts/register-commands.ts --clear       # 길드 명령어 전체 제거
 *   npx tsx scripts/register-commands.ts --dev-only    # 개발자 전용 명령어만 등록
 *
 * 주의: apps/bot 디렉토리에서 실행해야 .env 파일을 찾습니다.
 *   cd apps/bot && npx tsx ../../scripts/register-commands.ts
 */

import { REST, Routes, type RESTPostAPIChatInputApplicationCommandsJSONBody } from 'discord.js';
import { envParseArray, envParseString, setup } from '@skyra/env-utilities';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 1. Environment
// ---------------------------------------------------------------------------
setup({ path: join(process.cwd(), 'apps/bot/.env') });

const TOKEN = envParseString('DISCORD_TOKEN');
const DEV_GUILD_IDS = envParseArray('DEV_GUILD_IDS');

// ---------------------------------------------------------------------------
// 2. CLI flags
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const isGlobal = args.includes('--global');
const customGuild = args.find((a) => a.startsWith('--guild='))?.split('=')[1] ?? args.find((a) => a.startsWith('--guild '))?.split(' ')[1];
const isDryRun = args.includes('--dry');
const isClear = args.includes('--clear');
const devOnly = args.includes('--dev-only');

// ---------------------------------------------------------------------------
// 3. Command definitions — matches src/modules/*/commands/* exactly
// ---------------------------------------------------------------------------

const generalCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
	{
		name: 'ping',
		name_localizations: { ko: '핑' },
		description: '봇의 반응 속도를 보여드려요.',
		description_localizations: { ko: '봇의 반응 속도를 보여드려요.' },
		integration_types: [0] // GuildInstall
	},
	{
		name: 'help',
		name_localizations: { ko: '도움말' },
		description: '사용 가능한 명령어 목록을 보여줘요.',
		description_localizations: { ko: '사용 가능한 명령어 목록을 보여줘요.' },
		integration_types: [0]
	},
	{
		name: 'botinfo',
		name_localizations: { ko: '봇정보' },
		description: '봇의 정보와 통계를 보여줘요.',
		description_localizations: { ko: '봇의 정보와 통계를 보여줘요.' },
		integration_types: [0]
	},
	{
		name: 'serverinfo',
		name_localizations: { ko: '서버정보' },
		description: '현재 서버의 정보를 보여줘요.',
		description_localizations: { ko: '현재 서버의 정보를 보여줘요.' },
		integration_types: [0]
	},
	{
		name: 'userinfo',
		name_localizations: { ko: '유저정보' },
		description: '유저의 정보를 보여줘요.',
		description_localizations: { ko: '유저의 정보를 보여줘요.' },
		integration_types: [0],
		options: [
			{
				type: 6, // USER
				name: 'user',
				name_localizations: { ko: '유저' },
				description: 'The user to show info for.',
				description_localizations: { ko: '정보를 확인할 유저에요.' },
				required: false
			}
		]
	},
	{
		name: 'invite',
		name_localizations: { ko: '초대' },
		description: '봇 초대 링크를 보여줘요.',
		description_localizations: { ko: '봇 초대 링크를 보여줘요.' },
		integration_types: [0]
	},
	{
		name: 'avatar',
		name_localizations: { ko: '아바타' },
		description: '사용자의 아바타를 보여줘요.',
		description_localizations: { ko: '유저의 아바타를 보여줘요.' },
		integration_types: [0],
		options: [
			{
				type: 6, // USER
				name: 'user',
				name_localizations: { ko: '유저' },
				description: 'The user whose avatar to show.',
				description_localizations: { ko: '아바타를 확인할 유저에요.' },
				required: false
			},
			{
				type: 5, // BOOLEAN
				name: 'server',
				name_localizations: { ko: '서버아바타' },
				description: 'Show server-specific avatar if available.',
				description_localizations: { ko: '서버 아바타가 있으면 서버 아바타를 보여줘요.' },
				required: false
			}
		]
	}
];

const devCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
	{
		name: 'eval',
		description: '코드를 실행해요. (봇 소유자 전용)',
		integration_types: [0],
		dm_permission: false
	},
	{
		name: '리로드',
		description: '명령어 리로드',
		integration_types: [0],
		dm_permission: false
	},
	{
		name: '노드',
		description: 'Lavalink 노드 상태를 보여줘요. (봇 소유자 전용)',
		integration_types: [0],
		dm_permission: false
	},
	{
		name: '샤드',
		description: '샤드 상태를 보여줘요. (봇 소유자 전용)',
		integration_types: [0],
		dm_permission: false
	}
];

const audioCommands: RESTPostAPIChatInputApplicationCommandsJSONBody[] = [
	{
		name: 'play',
		name_localizations: { ko: '재생', 'en-US': 'play' },
		description: '음성 채널에서 노래를 재생해요.',
		description_localizations: { ko: '음성 채널에서 노래를 재생해요.' },
		integration_types: [0],
		options: [
			{
				type: 3, // STRING
				name: 'query',
				name_localizations: { ko: '검색어' },
				description: 'Enter the title or URL of the song you want to play.',
				description_localizations: { ko: '재생할 노래의 제목이나 주소를 입력해주세요.' },
				required: true,
				autocomplete: true
			},
			{
				type: 3, // STRING
				name: 'platform',
				name_localizations: { ko: '플랫폼' },
				description: 'Select the platform to search for music.',
				description_localizations: { ko: '노래를 찾을 플랫폼을 선택해주세요.' },
				required: false,
				choices: [
					{ name: '유튜브', name_localizations: { ko: '유튜브' }, value: 'ytsearch' },
					{ name: '사운드클라우드', name_localizations: { ko: '사운드클라우드' }, value: 'scsearch' },
					{ name: '스포티파이', name_localizations: { ko: '스포티파이' }, value: 'spsearch' }
				]
			}
		]
	},
	{
		name: 'skip',
		name_localizations: { ko: '건너뛰기' },
		description: '현재 재생 중인 곡을 건너뛰어요.',
		description_localizations: { ko: '현재 재생 중인 곡을 건너뜁니다.' },
		integration_types: [0],
		options: [
			{
				type: 5, // BOOLEAN
				name: 'force',
				name_localizations: { ko: '강제' },
				description: 'Skip the current track without a vote',
				description_localizations: { ko: '투표 없이 강제로 곡을 건너뛰어요.' },
				required: false
			},
			{
				type: 4, // INTEGER
				name: 'to',
				name_localizations: { ko: '곡' },
				description: 'Skip to the specified track',
				description_localizations: { ko: '건너뛸 곡의 번호를 입력해주세요.' },
				required: false,
				min_value: 1,
				autocomplete: true
			}
		]
	},
	{
		name: 'stop',
		name_localizations: { ko: '정지' },
		description: '대기열을 정리하고 노래를 멈춰요',
		description_localizations: { ko: '대기열을 정리하고 노래를 멈춰요' },
		integration_types: [0]
	},
	{
		name: 'pause',
		name_localizations: { ko: '일시정지' },
		description: '현재 곡을 일시정지하거나 다시 재생해요.',
		description_localizations: { ko: '현재 곡을 일시정지하거나 다시 재생해요.' },
		integration_types: [0]
	},
	{
		name: 'volume',
		name_localizations: { ko: '볼륨' },
		description: '플레이어의 볼륨을 설정해요.',
		description_localizations: { ko: '플레이어의 볼륨을 설정해요.' },
		integration_types: [0],
		options: [
			{
				type: 4, // INTEGER
				name: 'volume',
				name_localizations: { ko: '볼륨' },
				description: 'Set the volume of the player.',
				description_localizations: { ko: '설정할 볼륨을 입력해주세요.' },
				required: false,
				min_value: 0,
				max_value: 150
			}
		]
	},
	{
		name: 'shuffle',
		name_localizations: { ko: '셔플' },
		description: '대기열을 랜덤으로 섞어요.',
		description_localizations: { ko: '대기열을 랜덤으로 섞어요.' },
		integration_types: [0]
	},
	{
		name: 'seek',
		name_localizations: { ko: '탐색' },
		description: '현재 곡의 특정 시간으로 이동해요.',
		description_localizations: { ko: '현재 곡의 특정 시간으로 이동해요.' },
		integration_types: [0],
		options: [
			{
				type: 3, // STRING
				name: 'time',
				name_localizations: { ko: '시간' },
				description: 'Time to seek to (e.g. 1:30, 90, 0:45)',
				description_localizations: { ko: '이동할 시간이에요. (예: 1:30, 90, 0:45)' },
				required: true
			}
		]
	},
	{
		name: 'repeat',
		name_localizations: { ko: '반복' },
		description: '반복 모드를 설정해요.',
		description_localizations: { ko: '반복 모드를 설정해요.' },
		integration_types: [0],
		options: [
			{
				type: 3, // STRING
				name: 'mode',
				name_localizations: { ko: '모드' },
				description: 'Set the repeat mode.',
				description_localizations: { ko: '반복 모드를 설정해요.' },
				required: false,
				choices: [
					{ name: '끄기', name_localizations: { ko: '끄기' }, value: 'off' },
					{ name: '전체 곡', name_localizations: { ko: '전체 곡' }, value: 'queue' },
					{ name: '한 곡', name_localizations: { ko: '한 곡' }, value: 'track' }
				]
			}
		]
	},
	{
		name: 'remove',
		name_localizations: { ko: '삭제' },
		description: '대기열에서 특정 곡을 삭제해요.',
		description_localizations: { ko: '대기열에서 특정 곡을 삭제해요.' },
		integration_types: [0],
		options: [
			{
				type: 4, // INTEGER
				name: 'position',
				name_localizations: { ko: '위치' },
				description: 'Position of the track to remove',
				description_localizations: { ko: '삭제할 곡의 대기열 번호' },
				required: true,
				min_value: 1,
				autocomplete: true
			}
		]
	},
	{
		name: 'queue',
		name_localizations: { ko: '대기열' },
		description: '음악 대기열을 보거나 관리해요.',
		description_localizations: { ko: '음악 대기열을 보거나 관리해요.' },
		integration_types: [0],
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'list',
				name_localizations: { ko: '목록' },
				description: 'View the current queue.',
				description_localizations: { ko: '현재 대기열을 확인해요.' },
				options: [
					{
						type: 4, // INTEGER
						name: 'page',
						name_localizations: { ko: '페이지' },
						description: 'Page number to display.',
						description_localizations: { ko: '표시할 페이지 번호에요.' },
						required: false,
						min_value: 1
					}
				]
			},
			{
				type: 1, // SUB_COMMAND
				name: 'shuffle',
				name_localizations: { ko: '셔플' },
				description: 'Shuffle the queue.',
				description_localizations: { ko: '대기열을 셔플해요.' }
			},
			{
				type: 1, // SUB_COMMAND
				name: 'clear',
				name_localizations: { ko: '비우기' },
				description: 'Clear the entire queue.',
				description_localizations: { ko: '대기열을 전부 비워요.' }
			},
			{
				type: 1, // SUB_COMMAND
				name: 'remove',
				name_localizations: { ko: '제거' },
				description: 'Remove a track from the queue.',
				description_localizations: { ko: '대기열에서 곡을 제거해요.' },
				options: [
					{
						type: 4, // INTEGER
						name: 'position',
						name_localizations: { ko: '번호' },
						description: 'The position of the track to remove.',
						description_localizations: { ko: '제거할 곡의 번호에요.' },
						required: true,
						min_value: 1
					}
				]
			},
			{
				type: 1, // SUB_COMMAND
				name: 'move',
				name_localizations: { ko: '이동' },
				description: 'Move a track to a different position.',
				description_localizations: { ko: '곡의 위치를 이동해요.' },
				options: [
					{
						type: 4, // INTEGER
						name: 'from',
						name_localizations: { ko: '원래위치' },
						description: 'Current position of the track.',
						description_localizations: { ko: '이동할 곡의 현재 위치에요.' },
						required: true,
						min_value: 1
					},
					{
						type: 4, // INTEGER
						name: 'to',
						name_localizations: { ko: '이동위치' },
						description: 'New position for the track.',
						description_localizations: { ko: '곡을 이동할 위치에요.' },
						required: true,
						min_value: 1
					}
				]
			}
		]
	},
	{
		name: 'related',
		name_localizations: { ko: '추천곡' },
		description: '추천곡 자동재생을 켜거나 꺼요.',
		description_localizations: { ko: '추천곡 자동재생을 켜거나 끕니다.' },
		integration_types: [0],
		options: [
			{
				type: 5, // BOOLEAN
				name: 'enabled',
				name_localizations: { ko: '사용' },
				description: 'Enable or disable autoplay of related tracks',
				description_localizations: { ko: '추천곡 자동재생을 켜거나 끕니다.' },
				required: false
			}
		]
	},
	{
		name: 'previous',
		name_localizations: { ko: '이전곡' },
		description: '이전에 재생한 곡을 다시 재생해요.',
		description_localizations: { ko: '이전에 재생한 곡을 다시 재생해요.' },
		integration_types: [0]
	},
	{
		name: 'nowplaying',
		name_localizations: { ko: '현재곡' },
		description: '현재 재생 중인 곡의 정보를 보여줘요.',
		description_localizations: { ko: '현재 재생 중인 곡의 정보를 보여줘요.' },
		integration_types: [0]
	},
	{
		name: 'move',
		name_localizations: { ko: '이동' },
		description: '대기열에서 곡의 위치를 변경해요.',
		description_localizations: { ko: '대기열에서 곡의 위치를 변경해요.' },
		integration_types: [0],
		options: [
			{
				type: 4, // INTEGER
				name: 'from',
				name_localizations: { ko: '현재위치' },
				description: 'Current position of the track',
				description_localizations: { ko: '이동할 곡의 현재 번호' },
				required: true,
				min_value: 1,
				autocomplete: true
			},
			{
				type: 4, // INTEGER
				name: 'to',
				name_localizations: { ko: '목표위치' },
				description: 'New position for the track',
				description_localizations: { ko: '곡을 이동할 목표 번호' },
				required: true,
				min_value: 1
			}
		]
	},
	{
		name: 'lyrics',
		name_localizations: { ko: '가사' },
		description: '곡의 가사를 검색해요.',
		description_localizations: { ko: '현재 재생 중인 곡 또는 검색한 곡의 가사를 보여줘요.' },
		integration_types: [0],
		options: [
			{
				type: 3, // STRING
				name: 'query',
				name_localizations: { ko: '검색어' },
				description: 'Song title to search lyrics for (leave empty for current track)',
				description_localizations: { ko: '가사를 검색할 곡 제목 (비우면 현재 재생곡)' },
				required: false
			}
		]
	},
	{
		name: 'history',
		name_localizations: { ko: '기록' },
		description: '이 서버에서 재생된 최근 음악 기록을 보여줘요.',
		description_localizations: { ko: '이 서버에서 최근 재생된 음악 기록을 보여줍니다.' },
		integration_types: [0]
	},
	{
		name: 'favorites',
		name_localizations: { ko: '즐겨찾기' },
		description: '즐겨찾기한 노래를 관리해요.',
		description_localizations: { ko: '즐겨찾기를 관리해요.' },
		integration_types: [0],
		options: [
			{
				type: 1, // SUB_COMMAND
				name: 'add',
				name_localizations: { ko: '추가' },
				description: 'Add the currently playing track to your favorites.',
				description_localizations: { ko: '현재 재생 중인 곡을 즐겨찾기에 추가해요.' }
			},
			{
				type: 1, // SUB_COMMAND
				name: 'remove',
				name_localizations: { ko: '삭제' },
				description: 'Remove the currently playing track from your favorites.',
				description_localizations: { ko: '현재 재생 중인 곡을 즐겨찾기에서 삭제해요.' }
			},
			{
				type: 1, // SUB_COMMAND
				name: 'list',
				name_localizations: { ko: '목록' },
				description: 'Show your favorite tracks.',
				description_localizations: { ko: '즐겨찾기 목록을 보여줘요.' },
				options: [
					{
						type: 4, // INTEGER
						name: 'page',
						name_localizations: { ko: '페이지' },
						description: 'Page number to display.',
						description_localizations: { ko: '표시할 페이지 번호에요.' },
						required: false,
						min_value: 1
					}
				]
			},
			{
				type: 1, // SUB_COMMAND
				name: 'play',
				name_localizations: { ko: '재생' },
				description: 'Play all your favorite tracks.',
				description_localizations: { ko: '즐겨찾기의 모든 곡을 재생해요.' }
			}
		]
	},
	{
		name: 'filter',
		name_localizations: { ko: '필터' },
		description: '오디오 필터를 적용하거나 해제해요.',
		description_localizations: { ko: '오디오 필터를 적용하거나 해제해요.' },
		integration_types: [0],
		options: [
			{
				type: 3, // STRING
				name: 'preset',
				name_localizations: { ko: '프리셋' },
				description: 'Select a filter preset to toggle.',
				description_localizations: { ko: '적용할 필터 프리셋을 선택해요.' },
				required: false,
				choices: [
					{ name: '🔊 베이스부스트', name_localizations: { ko: '🔊 베이스부스트' }, value: 'bassboost' },
					{ name: '🌙 나이트코어', name_localizations: { ko: '🌙 나이트코어' }, value: 'nightcore' },
					{ name: '🌊 베이퍼웨이브', name_localizations: { ko: '🌊 베이퍼웨이브' }, value: 'vaporwave' },
					{ name: '🎧 8D', name_localizations: { ko: '🎧 8D' }, value: '8d' },
					{ name: '🎤 노래방', name_localizations: { ko: '🎤 노래방' }, value: 'karaoke' },
					{ name: '🔄 초기화', name_localizations: { ko: '🔄 초기화' }, value: 'reset' }
				]
			}
		]
	},
	{
		name: 'settings',
		name_localizations: { ko: '설정' },
		description: '봇의 서버 설정을 관리해요.',
		description_localizations: { ko: '봇의 서버 설정을 관리해요.' },
		integration_types: [0],
		default_member_permissions: String(1n << 5n) // ManageGuild
	}
];

// ---------------------------------------------------------------------------
// 4. Merge all commands
// ---------------------------------------------------------------------------
const allCommands = devOnly ? devCommands : [...generalCommands, ...devCommands, ...audioCommands];

// ---------------------------------------------------------------------------
// 5. Registration logic
// ---------------------------------------------------------------------------

async function fetchBotId(rest: REST): Promise<string> {
	const user = (await rest.get(Routes.user())) as { id: string };
	return user.id;
}

function summarize(commands: RESTPostAPIChatInputApplicationCommandsJSONBody[]): void {
	console.log(`\n  총 ${commands.length}개 명령어\n`);
	for (const cmd of commands) {
		const name = cmd.name_localizations?.ko ?? cmd.name;
		const hasSub = cmd.options?.some((o) => o.type === 1 || o.type === 2);
		console.log(`  • /${name}${hasSub ? ' (하위명령어 포함)' : ''} — ${cmd.description_localizations?.ko ?? cmd.description}`);
	}
}

async function main() {
	const rest = new REST({ version: '10' }).setToken(TOKEN);
	const clientId = await fetchBotId(rest);

	if (isDryRun) {
		console.log('\n=== 등록될 명령어 목록 (DRY RUN) ===');
		summarize(allCommands);
		console.log('\n( Dry run — 아무것도 등록되지 않았습니다 )\n');
		return;
	}

	// Determine target
	let targetGuildIds: string[] | null = null;

	if (isGlobal) {
		console.log('\n🌐 전역 명령어로 등록합니다.');
	} else if (customGuild) {
		targetGuildIds = [customGuild];
		console.log(`\n🏛️  길드 ${customGuild}에 등록합니다.`);
	} else if (DEV_GUILD_IDS.length > 0) {
		targetGuildIds = DEV_GUILD_IDS;
		console.log(`\n🏛️  개발 서버에 등록합니다: ${DEV_GUILD_IDS.join(', ')}`);
	} else {
		console.error('❌ DEV_GUILD_IDS가 설정되지 않았습니다. --guild=<id> 또는 --global 플래그를 사용하세요.');
		process.exit(1);
	}

	// Confirm
	console.log(`  Bot ID: ${clientId}`);
	summarize(allCommands);

	// ---------------------------------------------------------------------------
	// 6. Execute registration
	// ---------------------------------------------------------------------------
	try {
		if (isClear && targetGuildIds) {
			for (const guildId of targetGuildIds) {
				console.log(`\n🗑️  ${guildId} 길드 명령어를 모두 제거합니다...`);
				await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
				console.log('  ✅ 제거 완료');
			}
		} else if (targetGuildIds) {
			for (const guildId of targetGuildIds) {
				console.log(`\n📤 ${guildId} 길드에 ${allCommands.length}개 명령어 등록 중...`);
				const result = (await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
					body: allCommands
				})) as unknown[];
				console.log(`  ✅ 등록 완료 (${result.length}개 명령어)`);
			}
		} else if (isGlobal) {
			console.log(`\n📤 전역에 ${allCommands.length}개 명령어 등록 중...`);
			const result = (await rest.put(Routes.applicationCommands(clientId), {
				body: allCommands
			})) as unknown[];
			console.log(`  ✅ 전역 등록 완료 (${result.length}개 명령어)`);
			console.log('  ⚠️  전역 명령어는 전파까지 최대 1시간 소요될 수 있습니다.');
		}

		console.log('\n✨ 모든 작업이 완료되었습니다.\n');
	} catch (error) {
		console.error('\n❌ 명령어 등록 중 오류 발생:', error);
		process.exit(1);
	}
}

void main();
