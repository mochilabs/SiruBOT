import { ApplyOptions } from '@sapphire/decorators';
import { Events, Listener } from '@sapphire/framework';
import { captureSentryMessage } from '@sirubot/utils/sentry';
import { diffCommandNames, formatCommandDiff, hasCommandDiff } from '../../lib/commandRegistrationDiff.ts';

/**
 * 명령 등록 어긋남 감사 (P-04). Sapphire가 명령 등록을 마치면 전역 명령 목록을 가져와 소스와 이름을 비교해요.
 * 차이가 있으면 경고 로그와 Sentry 경고 1건을 남겨요. 프로세스마다 같은 결과라 샤드 0을 가진 프로세스만 확인해요.
 * 개발 명령(fullCategory 개발)은 개발 길드에만 등록돼서 비교에서 빼요.
 */
@ApplyOptions<Listener.Options>({ event: Events.ApplicationCommandRegistriesRegistered })
export class CommandRegistrationAudit extends Listener {
	public override async run() {
		// 한 번만 확인해요. `once: true`는 피스 unload 경합이 있어서 clientReady 리스너처럼 스스로 꺼요.
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
