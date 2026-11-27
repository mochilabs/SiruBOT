import { emoji } from '@sirubot/utils';
import { DiscordAPIError, PermissionFlagsBits, type Guild, type GuildMember, type PermissionsBitField } from 'discord.js';

const MAX_EMOJIS_REACHED = 30008;
const MISSING_PERMISSIONS = 50013;
const INVALID_FORM_BODY = 50035;

export function canCreateEmoji(permissions: Readonly<PermissionsBitField>): boolean {
	return permissions.has(PermissionFlagsBits.CreateGuildExpressions) || permissions.has(PermissionFlagsBits.ManageGuildExpressions);
}

export function emojiPermissionProblem(member: GuildMember, me: GuildMember | null): string | null {
	if (!canCreateEmoji(member.permissions)) return `${emoji('lock')} 서버 이모지를 등록하려면 **표현 만들기** 또는 **표현 관리** 권한이 필요해요.`;
	if (!me || !canCreateEmoji(me.permissions))
		return `${emoji('error')} 시루에게 **표현 만들기** 권한이 없어서 등록할 수 없어요. 서버 관리자에게 권한을 요청해 주세요.`;
	return null;
}

export async function createGuildEmoji(guild: Guild, image: Buffer, name: string, reason: string): Promise<string> {
	try {
		const created = await guild.emojis.create({ attachment: image, name, reason });
		return created.toString();
	} catch (error) {
		throw new Error(emojiCreateErrorText(error), { cause: error });
	}
}

export function emojiCreateErrorText(error: unknown): string {
	if (error instanceof DiscordAPIError) {
		if (error.code === MAX_EMOJIS_REACHED) return `${emoji('error')} 서버 이모지 칸이 가득 찼어요. 안 쓰는 이모지를 지우고 다시 시도해 주세요.`;
		if (error.code === MISSING_PERMISSIONS) return `${emoji('error')} 시루에게 **표현 만들기** 권한이 없어서 등록할 수 없어요.`;
		if (error.code === INVALID_FORM_BODY)
			return `${emoji('error')} 디스코드가 이 이름이나 이미지를 받지 않았어요. 다른 이름으로 다시 시도해 주세요.`;
	}
	return `${emoji('error')} 이모지를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.`;
}
