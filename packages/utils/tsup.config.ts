import { createConfig } from '../../scripts/tsup.config.js';

export default createConfig({
	// 서브패스 export(./time ./sentry ./secretBox ./customCommand ./playerState ./guildData ./memberGreeting ./greetingCardDesign ./redisEnvelope ./social ./playerWeb ./storage ./weather ./delivery ./client)와 1:1 대응해요.
	// package.json exports에 서브패스를 추가하면 여기 entry에도 같은 경로를 추가해야 dist/*.d.ts가 생겨요.
	// 루트(index)는 노드 전용·무거운 의존이 섞이므로, 클라이언트 번들로 들어가는 계약 모듈은 서브패스로만 써요.
	entry: [
		'src/index.ts',
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
		'src/client.ts',
		'src/ticket.ts'
	],
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	shims: true
});
