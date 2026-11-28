import { GatewayIntentBits, Partials } from 'discord.js';
import { BotApplication } from './botApplication.ts';
import { getConfig } from '../lib/config.ts';
import { SapphireInterfaceLogger } from './logger.ts';

export const createBotClient = (shardIds: number[] | 'auto', shardCount: number) => {
	const config = getConfig();
	return new BotApplication({
		logger: {
			instance: new SapphireInterfaceLogger({
				name: 'SiruBOT',
				minLevel: config.logLevel,
				type: 'pretty',
				hideLogPositionForProduction: config.isProduction
			})
		},
		shards: shardIds,
		shardCount,
		intents: [
			GatewayIntentBits.GuildModeration,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildVoiceStates,
			// 고정 채널(commandChannel) 입력용 프리빌리지 인텐트
			GatewayIntentBits.MessageContent
		],
		// 재시작 전 게시된 역할 패널 반응 이벤트 수신에 partial 필요
		partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.User]
	});
};
