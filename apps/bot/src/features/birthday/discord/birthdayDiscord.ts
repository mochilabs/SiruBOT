import { AttachmentBuilder, type Client, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { formatBirthdayNames, type GreetingCardKind } from '@sirubot/utils/birthdayCelebration';
import { renderGreetingTemplate, type GreetingConfig } from '@sirubot/utils/memberGreeting';
import type { AppLogger } from '../../../lib/appLogger.ts';
import type { GreetingMessagePort } from '../../greeting/index.ts';
import type { BirthdayDiscordPort } from '../application/birthdayService.ts';

/** 멤버 카드 렌더 — 인사 카드와 같은 data-api 경로예요 (`container.dataApi.renderMemberCard`) */
export type RenderBirthdayCard = (
	guildId: string,
	kind: GreetingCardKind,
	config: GreetingConfig,
	context: { userId: string; username: string; displayName: string; guildName: string | null; avatarUrl: string | null; memberCount: number }
) => Promise<{ buffer: Buffer; contentType: string } | null>;

export interface BirthdayDiscordDeps {
	getClient: () => Client;
	logger: AppLogger;
	renderMemberCard: RenderBirthdayCard;
	/** 인사 메시지와 같은 컴포넌트 구성 — 컨테이너·컴포넌트 목록 레이아웃과 강조색을 그대로 써요 */
	messages: GreetingMessagePort;
}

/** 멤버 조회 한 번에 요청하는 사용자 수 (게이트웨이 요청 상한) */
const MEMBER_FETCH_CHUNK = 100;

const isUnknown = (error: unknown) =>
	typeof error === 'object' && error !== null && 'code' in error && (error.code === 10007 || error.code === 10011 || error.code === 10013);

/** 생일 축하 서비스의 Discord 어댑터 — 멤버 조회, 카드 메시지 전송, 생일 역할 부여·회수를 맡아요 */
export function createBirthdayDiscord(deps: BirthdayDiscordDeps): BirthdayDiscordPort {
	return {
		async fetchMembers(guildId, userIds) {
			const guild = deps.getClient().guilds.cache.get(guildId);
			const result = new Map<string, import('../application/birthdayService.ts').BirthdayMember>();
			if (!guild) return result;
			const missing = userIds.filter((id) => !guild.members.cache.has(id));
			for (let i = 0; i < missing.length; i += MEMBER_FETCH_CHUNK) {
				await guild.members.fetch({ user: missing.slice(i, i + MEMBER_FETCH_CHUNK) });
			}
			for (const id of userIds) {
				const member = guild.members.cache.get(id);
				if (!member || member.user.bot) continue;
				result.set(id, {
					id,
					displayName: member.displayName,
					mention: member.toString(),
					avatarUrl: member.displayAvatarURL({ size: 256, extension: 'png' })
				});
			}
			return result;
		},

		async celebrate(guildId, card, members) {
			const client = deps.getClient();
			const guild = client.guilds.cache.get(guildId);
			if (!guild) throw new Error('봇이 그 서버의 최신 정보를 갖고 있지 않아요');
			const channel = card.channelId ? guild.channels.cache.get(card.channelId) : null;
			if (!channel?.isSendable() || !('permissionsFor' in channel)) throw new Error('축하 채널을 찾을 수 없어요');
			const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
			const permissions = me ? channel.permissionsFor(me) : null;
			if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions.has(PermissionFlagsBits.SendMessages)) {
				throw new Error('봇이 축하 채널에 메시지를 보낼 권한이 없어요');
			}

			const first = members[0]!;
			const names = formatBirthdayNames(members.map((member) => member.displayName));
			const content = renderGreetingTemplate(card.template, {
				mention: members.map((member) => member.mention).join(' '),
				displayName: names,
				guildName: guild.name,
				memberCount: guild.memberCount
			});

			let image: { buffer: Buffer; contentType: string } | null = null;
			if (card.useImage && card.image && permissions.has(PermissionFlagsBits.AttachFiles)) {
				image = await deps.renderMemberCard(guildId, 'birthday', card, {
					userId: first.id,
					username: first.displayName,
					displayName: names,
					guildName: guild.name,
					avatarUrl: first.avatarUrl,
					memberCount: guild.memberCount
				});
				if (!image) deps.logger.warn(`[birthday] 카드 렌더 실패, 텍스트로 이어가요 (guild ${guildId})`);
			}
			if (!image && content.trim().length === 0) throw new Error('축하 문구가 비어 있어요');

			const filename = `birthday.${image?.contentType === 'image/webp' ? 'webp' : 'png'}`;
			await channel.send({
				// 생일자만 알림이 가요 (템플릿에 @everyone·역할 멘션을 써도 전파되지 않아요)
				allowedMentions: { parse: [], users: members.map((member) => member.id) },
				components: deps.messages.components({
					// kind는 확인용 문구(isTest)에만 쓰여서 실제 전송에서는 의미가 없어요
					kind: 'welcome',
					isTest: false,
					content,
					imageFilename: image ? filename : null,
					avatarUrl: first.avatarUrl,
					layout: card.layout,
					accentColor: card.accentColor
				}),
				files: image ? [new AttachmentBuilder(image.buffer, { name: filename })] : [],
				flags: [MessageFlags.IsComponentsV2]
			});
		},

		async addRole(guildId, userId, roleId) {
			const guild = deps.getClient().guilds.cache.get(guildId);
			const member = guild ? await guild.members.fetch(userId).catch(() => null) : null;
			if (!guild || !member) return false;
			try {
				await member.roles.add(roleId, '생일 축하');
				return true;
			} catch (error) {
				deps.logger.warn(`[birthday] 역할 부여 실패 (${guildId}/${userId}): ${error instanceof Error ? error.message : String(error)}`);
				return false;
			}
		},

		async removeRole(guildId, userId, roleId) {
			const guild = deps.getClient().guilds.cache.get(guildId);
			if (!guild) return false;
			try {
				const member = await guild.members.fetch(userId);
				await member.roles.remove(roleId, '생일 하루가 지났어요');
				return true;
			} catch (error) {
				// 서버를 나갔거나 역할이 지워졌으면 거둘 게 없어요
				if (isUnknown(error)) return true;
				deps.logger.warn(`[birthday] 역할 회수 실패 (${guildId}/${userId}): ${error instanceof Error ? error.message : String(error)}`);
				return false;
			}
		}
	};
}
