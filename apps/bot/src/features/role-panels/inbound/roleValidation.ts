import { container } from '@sapphire/framework';
import { roleValidationRpc } from '@sirubot/utils';
import { createRedisResponder, type RedisBinding } from '../../../lib/redisResponder.ts';

export function createRoleValidationResponder(): RedisBinding {
	return createRedisResponder(
		roleValidationRpc,
		async ({ guild, request }) => ({ invalidRoleIds: container.rolePanelService.validateRoles(guild, request.roleIds) }),
		{ errorMessage: `역할을 검증하지 못했어요. 잠시 후 다시 시도해 주세요.` }
	);
}
