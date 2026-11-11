/**
 * 길드 설정 캐시 무효화 리스너 — 대시보드 저장 → data-api Redis PUBLISH → 봇 캐시 무효화.
 *
 * 대시보드는 Prisma로 DB를 직접 upsert하므로 봇의 GuildService 60초 캐시가 stale해져요.
 * data-api의 내부 엔드포인트가 Redis 채널(`sirubot:guild-settings:invalidate`)로
 * guildId를 브로드캐스트하면, 각 봇 프로세스(샤드 replica마다 1개)가 이 리스너로
 * 자기 캐시만 무효화해요. 무효화는 guildId만 전달하고 봇이 DB에서 다시 읽어요.
 * 대시보드에서 믹서(갭리스·크로스페이드)를 저장하면 reason: 'mixer'가 함께 와서,
 * 이 길드를 보유한 봇이 재생 중인 플레이어에 설정을 바로 밀어 넣어요 (/믹서 커맨드와 같은 동작).
 *
 * - 이 채널은 대시보드 저장 흐름이 서명 없이 퍼블리시해요 (계약의 signed: false).
 * - 연결 실패/끊김 시에도 봇은 정상 동작해요 — TTL(60초) 폴백이 있고, 공유 구독이 재연결을 시도해요.
 */
import { container } from '@sapphire/framework';
import { guildSettingsInvalidateEvent } from '@sirubot/utils';
import { needsUpcomingTrack } from '@sirubot/utils/mixerTransition';
import { createRedisEventListener, type RedisBinding } from '../../../lib/redisResponder.ts';
import type { RedisLogger } from '../../../lib/redisPublisher.ts';
import * as guildMixer from '../../../services/guildSettings/mixer.ts';
import { clearGuildCustomCommandsCache, syncGuildSlashCommands } from '../../custom-commands/index.ts';

/**
 * 믹서(갭리스·크로스페이드) 저장의 라이브 적용 — /믹서 커맨드와 같은 동작이에요.
 * 이 길드를 보유한 레플리카만 getPlayer가 잡아요. 재생 중이 아니면 다음 재생 때
 * DB 설정이 적용되므로, 노드 장애(플러그인 없음 등)는 경고로만 넘어가요.
 */
async function applyMixerToPlayer(guildId: string, logger: RedisLogger): Promise<void> {
	try {
		const player = container.audio.getPlayer(guildId);
		if (!player) return;
		const settings = await guildMixer.getMixerSettings(container.guildService, guildId);
		await container.mixerService.pushCrossfadeConfig(player);
		if (needsUpcomingTrack(settings)) {
			await container.mixerService.preloadUpcoming(player, { force: true }).catch(() => null);
		} else {
			await container.mixerService.clearNext(player, { force: true }).catch(() => null);
		}
		logger.debug(`믹서 설정을 재생 중 플레이어에 적용: ${guildId}`);
	} catch (error) {
		logger.warn(`믹서 라이브 적용 실패 (guild ${guildId}): ${error instanceof Error ? error.message : String(error)}`);
	}
}

export function createGuildSettingsInvalidationListener(): RedisBinding {
	return createRedisEventListener(guildSettingsInvalidateEvent, ({ event, logger }) => {
		const { guildId } = event;
		container.guildService.invalidate(guildId);
		// 커스텀 명령어 테이블도 같은 채널로 무효화돼요 — 커스텀 명령어 저장·접두사 변경이 함께 와요
		clearGuildCustomCommandsCache(guildId);
		// 슬래시형 커스텀 명령어는 등록/해제도 같은 저장 흐름이에요 — 이 길드의 슬래시 커맨드를 DB와 맞춰요
		void syncGuildSlashCommands(guildId, logger);
		logger.debug(`길드 설정 캐시 무효화: ${guildId}`);
		if (event.reason === 'mixer') void applyMixerToPlayer(guildId, logger);
	});
}
