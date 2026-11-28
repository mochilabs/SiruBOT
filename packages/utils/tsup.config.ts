import { createConfig } from '../../scripts/tsup.config.js';

export default createConfig({
	// Keep in sync with package.json subpath exports for dist/*.d.ts generation.
	entry: [
		'src/index.ts',
		'src/mixerTransition.ts',
		'src/time.ts',
		'src/sentry.ts',
		'src/secretBox.ts',
		'src/customCommand.ts',
		'src/chatTools.ts',
		'src/playerState.ts',
		'src/guildData.ts',
		'src/memberGreeting.ts',
		'src/greetingCardDesign.ts',
		'src/redisEnvelope.ts',
		'src/social.ts',
		'src/playerWeb.ts',
		'src/storage.ts',
		'src/weather.ts',
		'src/delivery.ts',
		'src/birthday.ts',
		'src/ticket.ts',
		'src/starboard.ts',
		'src/scheduledMessage.ts',
		'src/birthdayCelebration.ts',
		'src/giveaway.ts',
		'src/rolePanel.ts',
		'src/botAdmin.ts',
		'src/memoryFile.ts',
		'src/playerLimits.ts',
		'src/guildSettingsContract.ts',
		'src/trackIdentity.ts',
		'src/modules.ts',
		'src/brand.ts',
		'src/lrc.ts',
		'src/incidentNotice.ts'
	],
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	shims: true
});
