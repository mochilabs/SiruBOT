import { container } from '@sapphire/framework';
import { roleValidationRpc } from '@sirubot/utils';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

/**
 * 역할 부여 가능 여부 검증 응답자 — 대시보드가 패널 저장 전에 roleIds를 보내 부여 가능한 역할인지 확인해요.
 *
 * 대시보드가 data-api `/v1/internal/role-panel/validate-roles`에 요청하면 data-api가 REQUEST 채널
 * (`sirubot:role-validation:request`)로 {requestId, guildId, roleIds}를 브로드캐스트하고, 그 길드를 보유한
 * 봇 프로세스가 rolePanelService.validateRoles로 검증한 뒤 RESPONSE 채널로 invalidRoleIds를 응답해요.
 * 이 프로세스가 보유하지 않은 길드면 조용히 무시해요. 수신·서명·검증·응답 골격은 lib/redisResponder.ts가 맡아요.
 */
export function createRoleValidationResponder(): RedisBinding {
	return createRedisResponder(
		roleValidationRpc,
		async ({ guild, request }) => ({ invalidRoleIds: container.rolePanelService.validateRoles(guild, request.roleIds) }),
		{ errorMessage: `역할을 검증하지 못했어요. 잠시 후 다시 시도해 주세요.` }
	);
}
