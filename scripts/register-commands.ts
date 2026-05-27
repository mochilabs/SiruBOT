import { config } from 'dotenv';
import { join } from 'node:path';

// 실행 위치에 상관없이 apps/bot/.env 파일을 정상적으로 탐색하여 로드합니다.
config();
config({ path: join(process.cwd(), 'apps', 'bot', '.env') });

import { BotApplication } from '../apps/bot/src/core/botApplication.ts';
import { GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } from 'discord.js';
import { blue, green, yellow, red, bold, gray, cyan } from 'colorette';

// CLI 인자 파싱
const args = process.argv.slice(2);
const showHelp = args.includes('--help') || args.includes('-h');
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const forceGlobal = args.includes('--global') || args.includes('-g');

// --guild 파싱
let targetGuildId: string | undefined = undefined;
const guildIdx = args.findIndex(arg => arg === '--guild' || arg === '-guild');
if (guildIdx !== -1 && args[guildIdx + 1] && !args[guildIdx + 1].startsWith('-')) {
	targetGuildId = args[guildIdx + 1];
} else if (args.includes('--guild') || args.includes('-guild')) {
	// 인자만 있고 뒤에 ID가 없는 경우 .env의 GUILD_ID 사용
	targetGuildId = process.env.GUILD_ID;
}

if (showHelp) {
	console.log(bold(cyan('\n[SiruBOT 동적 슬래시 커맨드 동기화 도구 도움말]')));
	console.log(gray('==============================================='));
	console.log(bold('사용법:'));
	console.log(gray('  yarn dlx tsx scripts/register-commands.ts [옵션]\n'));
	console.log(bold('옵션 목록:'));
	console.log(`  ${bold('-h, --help')}       : 현재 도움말 화면을 출력하고 종료합니다.`);
	console.log(`  ${bold('-d, --dry-run')}    : 실제로 Discord API를 호출하지 않고 로컬 파싱 명세를 검증합니다.`);
	console.log(`  ${bold('-g, --global')}     : 길드 설정을 무시하고 글로벌 슬래시 커맨드로 배포합니다.`);
	console.log(`  ${bold('--guild <id>')}     : 특정 Discord 길드 ID에 슬래시 커맨드를 즉시 동기화합니다.`);
	console.log(gray('                       (길드 ID 미지정 시 .env 파일의 DEV_GUILD_IDS 또는 GUILD_ID 값을 기본 적용합니다.)\n'));
	console.log(bold('기본 동작:'));
	console.log(gray('  아무 옵션이 없을 경우, .env 파일에 길드 ID가 있다면 길드 전용 배포로 동작하며,'));
	console.log(gray('  길드 ID가 없다면 글로벌 배포를 시도합니다.'));
	console.log(gray('===============================================\n'));
	process.exit(0);
}

// Discord API 등록을 위한 Mock Registry 구현
class MockRegistry {
	public chatInputBuilders: any[] = [];

	public registerChatInputCommand(
		builderOrValue:
			| SlashCommandBuilder
			| ((builder: SlashCommandBuilder) => SlashCommandBuilder)
			| ((builder: SlashCommandBuilder) => any)
	) {
		if (typeof builderOrValue === 'function') {
			const builder = new SlashCommandBuilder();
			const result = builderOrValue(builder);
			this.chatInputBuilders.push(result ?? builder);
		} else {
			this.chatInputBuilders.push(builderOrValue);
		}
	}

	public registerContextMenuCommand() { }
}

async function main() {
	const token = process.env.DISCORD_TOKEN;

	// DISCORD_TOKEN의 첫 번째 세그먼트(Base64)를 파싱하여 Bot ID(Client ID)를 자동 추출합니다.
	let clientId = process.env.CLIENT_ID || process.env.BOT_ID;
	if (!clientId && token) {
		try {
			clientId = Buffer.from(token.split('.')[0], 'base64').toString('utf-8');
		} catch {
			// 파싱 실패
		}
	}

	// --guild 파싱 및 .env 환경변수 폴백 (GUILD_ID 또는 DEV_GUILD_IDS 지원)
	const envGuildId = process.env.GUILD_ID || process.env.DEV_GUILD_IDS;
	const guildId = forceGlobal ? undefined : (targetGuildId || envGuildId);

	console.log(bold(cyan('\n[SiruBOT 동적 슬래시 커맨드 동기화 도구]')));
	console.log(gray('==============================================='));

	if (isDryRun) {
		console.log(bold(yellow('[DRY RUN MODE] 실제로 Discord API를 호출하지 않고 로컬 스펙을 검증합니다.')));
	}

	if (!token) {
		console.error(red('에러: DISCORD_TOKEN이 .env 파일에 정의되어 있지 않습니다.'));
		process.exit(1);
	}
	if (!clientId) {
		console.error(red('에러: CLIENT_ID (또는 BOT_ID)를 파싱하지 못했습니다. .env 설정을 확인해주세요.'));
		process.exit(1);
	}

	console.log(gray(`대상 봇 ID: ${clientId}`));
	console.log(gray(`대상 범위: ${guildId ? `길드 전용 (${guildId})` : '글로벌 배포'}`));

	console.log(blue('Sapphire Client를 초기화하고 명령어 모듈을 로드합니다...'));

	// DB/Redis 연결 없이 명령어 메타데이터 수집만 수행하도록 최소 사양 클라이언트 인스턴스화
	const client = new BotApplication({
		intents: [GatewayIntentBits.Guilds],
		partials: [Partials.Channel]
	});

	// 실행 디렉토리에 영향받지 않도록 절대경로 주입
	const botSrcPath = join(process.cwd(), 'apps', 'bot', 'src');
	client.stores.registerPath(join(botSrcPath, 'modules', 'audio'));
	client.stores.registerPath(join(botSrcPath, 'modules', 'general'));

	try {
		// Sapphire Store 내장 로더를 수동으로 기동하여 명령어를 로드합니다.
		await Promise.all(client.stores.map((store) => store.loadAll()));

		const commandsStore = client.stores.get('commands');
		const mockRegistry = new MockRegistry();

		console.log(green(`총 ${commandsStore.size}개의 명령어 파일이 동적으로 스캔되었습니다.`));
		console.log(blue('명령어 메타데이터 파싱 및 스키마 직렬화 중...'));

		// 발견된 각 명령어 클래스 인스턴스의 registerApplicationCommands를 실행하여
		// SlashCommandBuilder 객체 데이터를 MockRegistry에 적재합니다.
		for (const command of commandsStore.values()) {
			try {
				// @ts-ignore
				await command.registerApplicationCommands(mockRegistry as any);
			} catch (err: any) {
				console.warn(yellow(`[${command.name}] 명령어 파싱 과정 중 스킵 처리되었습니다: ${err.message || err}`));
			}
		}

		// 적재된 모든 빌더 정보를 Discord REST 규격인 JSON으로 변환합니다.
		const serializedCommands = mockRegistry.chatInputBuilders.map((builder) => {
			const json = builder.toJSON();
			console.log(json)
			return {
				name: json.name,
				description: json.description,
				optionsCount: json.options?.length ?? 0,
				raw: json
			};
		});

		if (serializedCommands.length === 0) {
			console.warn(yellow('등록할 슬래시 커맨드가 존재하지 않습니다. 스크립트를 종료합니다.'));
			return;
		}

		console.log(gray('\n--- 동적으로 수집된 슬래시 커맨드 목록 ---'));
		serializedCommands.forEach((cmd, idx) => {
			console.log(
				`  ${bold(green(`${idx + 1}.`))} /${bold(blue(cmd.name))} - ${gray(cmd.description)} ` +
				`[${cyan(`옵션 ${cmd.optionsCount}개`)}]`
			);
		});
		console.log(gray('---------------------------------------------\n'));

		if (isDryRun) {
			console.log(bold(green('[DRY RUN 성공] 모든 슬래시 커맨드가 정상적으로 동적 파싱 및 로드되었습니다.')));
			console.log(gray(`- 로드된 총 명령어 수: ${serializedCommands.length}개`));
			console.log(gray(`- 배포 예정 형태: ${guildId ? `길드 전용 (${guildId})` : '글로벌 배포'}`));
			console.log(gray('실제 API에 배포하려면 --dry-run / -d 옵션을 빼고 실행하세요.'));
			return;
		}

		const rest = new REST({ version: '10' }).setToken(token);
		const rawPayloads = serializedCommands.map(c => c.raw);

		if (guildId) {
			console.log(bold(blue(`특정 길드(${guildId})에 ${serializedCommands.length}개의 슬래시 커맨드를 배포합니다...`)));
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
				body: rawPayloads
			});
			console.log(bold(green(`길드 명령어 동기화 성공! (${serializedCommands.length}개)`)));
		} else {
			console.log(bold(blue(`글로벌로 ${serializedCommands.length}개의 슬래시 커맨드를 배포합니다... (반영에 몇 분 정도 걸릴 수 있습니다)`)));
			await rest.put(Routes.applicationCommands(clientId), {
				body: rawPayloads
			});
			console.log(bold(green(`글로벌 명령어 동기화 성공! (${serializedCommands.length}개)`)));
		}
	} catch (error) {
		console.error(red('동적 슬래시 커맨드 동기화 중 에러가 발생했습니다:'), error);
		process.exit(1);
	}
}

main();
