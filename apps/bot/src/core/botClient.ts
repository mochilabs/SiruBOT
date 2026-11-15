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
			// 고정 채널(commandChannel) 입력을 받으려면 메시지 본문이 필요 — 프리빌리지 인텐트, 개발자 포털에서도 활성화해야 함
			GatewayIntentBits.MessageContent
		],
		// Reaction·User: 재시작 전에 게시한 역할 패널 메시지의 반응 이벤트도 받으려면 partial이 필요해요
		partials: [Partials.Channel, Partials.GuildMember, Partials.Message, Partials.Reaction, Partials.User]
	});
};
