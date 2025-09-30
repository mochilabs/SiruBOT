import { envParseString } from '@skyra/env-utilities';
import { container } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';
import { BotApplication } from './botApplication.ts';
import { SapphireInterfaceLogger } from './logger.ts';

export const main = async () => {
	const client = new BotApplication({
		logger: {
			instance: new SapphireInterfaceLogger({
				name: 'SiruBOT',
				minLevel: envParseString('LOGLEVEL'),
				type: 'pretty',
				hideLogPositionForProduction: process.env.NODE_ENV === 'production'
			})
		},
		shards: 'auto',
		intents: [
			GatewayIntentBits.GuildModeration,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildMessageReactions,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.MessageContent
		],
		partials: [Partials.Channel, Partials.GuildMember, Partials.Message]
	});

	try {
		// show pid and pid-name
		client.logger.info(`Starting SiruBOT with PID: ${process.pid}`);

		client.logger.debug('Setting up logger...');
		container.logger = client.logger;

		// Audio -> General -> RedisStore -> Login -> Lavalink (After ready event)
		client.setupStore('audio');
		client.setupStore('general');

		client.logger.debug('Setting up database...');
		await client.setupDatabase();

		client.logger.debug('Setting up services...');
		client.setupServices();

		client.logger.debug('Setting up redis store manager... (optional)');
		await client.setupRedis(envParseString('REDIS_URL'));

		client.logger.info('Logging into discord...');
		await client.login(envParseString('DISCORD_TOKEN'));

		client.logger.debug('Setting up lavalink...');
		await client.setupAudio(JSON.parse(envParseString('LAVALINK_HOSTS')));

		client.logger.info('Logged in as ' + client.user!.tag);
	} catch (error) {
		client.logger.error('Error setting up application...');
		client.logger.fatal(error);
		await client.destroy();
		process.exit(1);
	}
};
