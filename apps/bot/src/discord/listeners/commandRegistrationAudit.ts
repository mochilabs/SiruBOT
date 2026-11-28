import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { captureSentryMessage } from '@sirubot/utils/sentry';
import { diffCommandNames, formatCommandDiff, hasCommandDiff } from '../../lib/commandRegistrationDiff.ts';

@ApplyOptions<Listener.Options>({ event: Events.ApplicationCommandRegistriesRegistered })
export class CommandRegistrationAudit extends Listener {
	public override async run() {
		// once: true는 피스 unload 경합이 있어 수동 비활성화해요.
		this.enabled = false;
		const { client, logger } = this.container;
		const shard = client.shard;
		if (shard && !shard.ids.includes(0)) return;
		if (!client.application) return;

		try {
			const remote = await client.application.commands.fetch();
			const local = [...this.container.stores.get('commands').values()]
				.filter((command) => !command.fullCategory.includes('개발'))
				.map((command) => command.name);
			const diff = diffCommandNames(
				local,
				[...remote.values()].map((command) => command.name)
			);
			if (!hasCommandDiff(diff)) {
				logger.debug(`[commands] 전역 명령 ${remote.size}개가 소스와 같아요`);
				return;
			}
			const summary = formatCommandDiff(diff);
			logger.warn(`[commands] 등록된 명령이 소스와 달라요: ${summary}. scripts/register-commands.ts --dry-run으로 확인하세요.`);
			captureSentryMessage('slash command registration differs from source', 'warning', { ...diff });
		} catch (error) {
			logger.warn(`[commands] 등록 명령 감사 실패: ${error}`);
		}
	}
}
