import { ApplyOptions } from '@sapphire/decorators';
import { Command, UserError } from '@sapphire/framework';
import { emoji, createContainer, formatTimeToKorean } from '@sirubot/utils';
import {
	ApplicationIntegrationType,
	ChatInputCommandInteraction,
	MessageFlags,
	SectionBuilder,
	TextDisplayBuilder,
	ThumbnailBuilder
} from 'discord.js';
import { getZodiacFromDate, ZODIAC_MAP } from '../../games/utils/ohaasaService.ts';
import { clearUserBirthday, isValidBirthday, setUserBirthday } from '../utils/userProfile.ts';
import { buildProfileCardData, formatGameStatsLines } from '../utils/profileCardData.ts';
import { renderProfileCard } from '../../../services/dataApiClient.ts';
import { streakBadge } from '../../games/utils/gameRecords.ts';

function zodiacLabel(code: string): string {
	const info = ZODIAC_MAP[code];
	return info ? `${info.ko} (${info.jp})` : '알 수 없음';
}

@ApplyOptions<Command.Options>({
	enabled: true,
	name: 'profile',
	description: '프로필(생일·별자리·음악 기록)을 확인하고 관리해요.',
	fullCategory: ['일반']
})
export class ProfileCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		registry.registerChatInputCommand((builder) => {
			builder
				.setIntegrationTypes(ApplicationIntegrationType.GuildInstall)
				.setName(this.name)
				.setNameLocalizations({ ko: '프로필' })
				.setDescription(this.description)
				.setDescriptionLocalizations({ ko: '프로필(생일·별자리·음악 기록)을 확인하고 관리해요.' })
				.addSubcommand((sub) =>
					sub
						.setName('view')
						.setNameLocalizations({ ko: '보기' })
						.setDescription('Show a profile.')
						.setDescriptionLocalizations({ ko: '프로필을 보여줘요. 유저를 지정하면 다른 사람의 프로필을 봐요.' })
						.addUserOption((option) =>
							option
								.setName('user')
								.setNameLocalizations({ ko: '유저' })
								.setDescription('The user to show the profile for.')
								.setDescriptionLocalizations({ ko: '프로필을 확인할 유저예요. 비우면 내 프로필을 보여줘요.' })
								.setRequired(false)
						)
						.addBooleanOption((option) =>
							option
								.setName('private')
								.setNameLocalizations({ ko: '나만보기' })
								.setDescription('Show the response only to you.')
								.setDescriptionLocalizations({ ko: '다른 사람에게 안 보이게 나만 보여줘요.' })
								.setRequired(false)
						)
						.addStringOption((option) =>
							option
								.setName('style')
								.setNameLocalizations({ ko: '스타일' })
								.setDescription('Profile card design.')
								.setDescriptionLocalizations({ ko: '프로필 카드 디자인이에요. 기본은 다크 퍼플 카드예요.' })
								.addChoices({ name: '다크 (기본)', value: 'dark' }, { name: '멤버 패스 티켓', value: 'ticket' })
								.setRequired(false)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('set-birthday')
						.setNameLocalizations({ ko: '생일설정' })
						.setDescription('Set my birthday (used for zodiac features).')
						.setDescriptionLocalizations({ ko: '내 생일을 등록해요. 별자리가 자동 계산돼요.' })
						.addIntegerOption((option) =>
							option
								.setName('month')
								.setNameLocalizations({ ko: '월' })
								.setDescription('Birth month (1-12).')
								.setDescriptionLocalizations({ ko: '생일 월 (1~12)' })
								.setMinValue(1)
								.setMaxValue(12)
								.setRequired(true)
						)
						.addIntegerOption((option) =>
							option
								.setName('day')
								.setNameLocalizations({ ko: '일' })
								.setDescription('Birth day (1-31).')
								.setDescriptionLocalizations({ ko: '생일 일 (1~31)' })
								.setMinValue(1)
								.setMaxValue(31)
								.setRequired(true)
						)
				)
				.addSubcommand((sub) =>
					sub
						.setName('clear-birthday')
						.setNameLocalizations({ ko: '생일삭제' })
						.setDescription('Delete my saved birthday.')
						.setDescriptionLocalizations({ ko: '등록한 생일을 지워요.' })
				);
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const subcommand = interaction.options.getSubcommand(true);

		if (subcommand === 'set-birthday') {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
			const month = interaction.options.getInteger('month', true);
			const day = interaction.options.getInteger('day', true);
			if (!isValidBirthday(month, day)) {
				throw new UserError({
					identifier: 'profile_invalid_birthday',
					message: `${emoji('error')} 존재하지 않는 날짜예요. 달에 맞는 날짜를 입력해 주세요.`,
					context: { ephemeral: true }
				});
			}
			await setUserBirthday(interaction.user.id, month, day);
			const zodiacCode = getZodiacFromDate(month, day);
			const containerComponent = createContainer();
			containerComponent.addTextDisplayComponents((t) =>
				t.setContent(
					[
						`### ${emoji('cake')} 생일을 저장했어요`,
						'',
						`**${month}월 ${day}일**: 별자리는 **${zodiacCode ? zodiacLabel(zodiacCode) : '알 수 없음'}**예요.`,
						'',
						'-# 생일은 본인에게만 보여요. 다른 사람에게는 별자리만 공개돼요.',
						'-# 이제 `/오하아사`에서 지정 없이도 내 운세를 바로 보여줘요.'
					].join('\n')
				)
			);
			await interaction.editReply({
				components: [containerComponent],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		if (subcommand === 'clear-birthday') {
			await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
			const cleared = await clearUserBirthday(interaction.user.id);
			const containerComponent = createContainer();
			containerComponent.addTextDisplayComponents((t) =>
				t.setContent(cleared ? `${emoji('trash')} 등록된 생일을 지웠어요.` : `${emoji('info')} 등록된 생일이 없어요.`)
			);
			await interaction.editReply({
				components: [containerComponent],
				flags: [MessageFlags.IsComponentsV2]
			});
			return;
		}

		// view — 기본 공개. 나만보기(true)면 ephemeral. 생일은 여전히 본인 조회 때만 데이터에 실어요.
		const target = interaction.options.getUser('user') ?? interaction.user;
		const showPrivate = interaction.options.getBoolean('private') ?? false;
		const preset = (interaction.options.getString('style') ?? 'dark') as 'dark' | 'ticket';
		await interaction.deferReply({ flags: showPrivate ? [MessageFlags.Ephemeral] : undefined });

		const data = await buildProfileCardData(target.id, interaction.user.id, interaction.guildId);

		// 멤버 조회는 한 번만 — 이미지 카드(참가일/역할/상태)와 텍스트 카드가 공유해요.
		const member = interaction.inCachedGuild()
			? (interaction.guild.members.cache.get(target.id) ?? (await interaction.guild.members.fetch(target.id).catch(() => null)))
			: null;
		const guildJoinedAt = member?.joinedTimestamp ? new Date(member.joinedTimestamp).toISOString() : null;

		let bannerUrl: string | null = null;
		let guildTag: string | null = null;
		let guildTagBadgeUrl: string | null = null;
		try {
			const fetchedUser = await target.fetch();
			bannerUrl = fetchedUser.bannerURL({ size: 1024, extension: 'png' }) ?? null;
			// 서버 태그 (디스코드 길드 아이덴티티) — identityEnabled + 태그 있을 때만
			const pg = fetchedUser.primaryGuild;
			if (pg?.identityEnabled && pg.tag) {
				guildTag = pg.tag;
				guildTagBadgeUrl = fetchedUser.guildTagBadgeURL({ size: 64, extension: 'png' }) ?? null;
			}
		} catch {
			// 배너 없음/조회 실패 → 별자리 배경으로 그려요
		}

		// 역할 캡슐 — 캐시 역할 순 상위 4개 (@everyone 제외)
		const roleChips =
			member && interaction.inCachedGuild()
				? member.roles.cache
						.filter((role) => role.id !== interaction.guildId)
						.sort((a, b) => b.position - a.position)
						.map((role) => role.name)
						.slice(0, 4)
				: [];

		// 지금 재생 중 — 대상 유저가 요청자인 현재 트랙 (플레이어가 있을 때만)
		let nowPlaying: { title: string; artist: string; thumbnailUrl: string | null } | null = null;
		const player = interaction.guildId ? this.container.audio?.getPlayer(interaction.guildId) : undefined;
		const current = player?.queue.current;
		if (current) {
			const requester = current.requester;
			const requesterId = requester && typeof requester === 'object' ? (requester as Record<string, unknown>).id : undefined;
			if (requesterId === target.id) {
				nowPlaying = {
					title: current.info.title,
					artist: current.info.author,
					thumbnailUrl: current.info.artworkUrl ?? null
				};
			} else {
				const next = player?.queue.tracks.find(
					(t) => (typeof t.requester === 'object' ? (t.requester as { id?: string }).id : undefined) === target.id
				);
				if (next) {
					nowPlaying = {
						title: next.info.title,
						artist: next.info.author ?? '',
						thumbnailUrl: next.info.artworkUrl ?? null
					};
				}
			}
		}

		const derivedStatus = (member?.presence?.status ?? 'online') as 'online' | 'idle' | 'dnd' | 'invisible';

		const cardPng = await renderProfileCard({
			preset,
			userId: target.id,
			displayName: target.displayName ?? target.username,
			username: target.username,
			avatarUrl: target.displayAvatarURL({ size: 256, extension: 'png' }),
			bannerUrl,
			zodiacCode: data.zodiacCode,
			zodiacKo: data.zodiacCode ? (ZODIAC_MAP[data.zodiacCode]?.ko ?? '별자리 없음') : '별자리 없음',
			zodiacJp: data.zodiacCode ? (ZODIAC_MAP[data.zodiacCode]?.jp ?? null) : null,
			birthMonth: data.birthMonth,
			birthDay: data.birthDay,
			playlistCount: data.playlistCount,
			requestedCount: data.requestedCount,
			listenText: formatTimeToKorean(Math.floor(data.listenMs / 1000)),
			accountCreated: new Date(target.createdTimestamp).toISOString(),
			guildJoinedAt,
			topTracks: data.topTracks.slice(0, 3).map((t) => ({
				title: t.title,
				artist: t.artist,
				thumbnailUrl: t.artworkUrl ?? null
			})),
			gameStats: data.gameStats,
			checkinStreak: data.checkinStreak,
			status: derivedStatus,
			statusLabel: '',
			intro: '',
			roleChips,
			guildTag,
			guildTagBadgeUrl,
			nowPlaying
		}).catch(() => null);

		if (cardPng) {
			const { AttachmentBuilder } = await import('discord.js');
			const attachment = new AttachmentBuilder(cardPng, { name: `profile-${target.id}.png` });
			if (showPrivate) {
				await interaction.editReply({
					files: [attachment],
					flags: [MessageFlags.IsComponentsV2],
					components: [createContainer()]
				});
			} else {
				await interaction.editReply({
					files: [attachment]
				});
			}
			return;
		}

		// 텍스트 카드 (폴백)
		const lines = [`### ${emoji('user')} ${target.displayName ?? target.username} 님의 프로필`, ''];

		// 생일·별자리 — 생일은 본인에게만
		if (data.isSelf) {
			if (data.birthMonth != null && data.birthDay != null) {
				lines.push(`${emoji('cake')} **생일**: ${data.birthMonth}월 ${data.birthDay}일`);
				lines.push(`${emoji('crystal_ball')} **별자리**: ${data.zodiacCode ? zodiacLabel(data.zodiacCode) : '알 수 없음'}`);
			} else {
				lines.push(`${emoji('cake')} **생일**: 미등록`);
				lines.push('-# `/프로필 생일설정`으로 등록하면 오하아사가 내 운세를 자동으로 보여줘요.');
			}
		} else if (data.zodiacCode) {
			lines.push(`${emoji('crystal_ball')} **별자리**: ${zodiacLabel(data.zodiacCode)}`);
		}

		// 출석 스트릭 뱃지
		if (data.checkinStreak > 0) {
			lines.push(`${streakBadge(data.checkinStreak)} **출석**: ${data.checkinStreak}일 연속`);
		}

		// 서버 정보 (길드 안에서만, 멤버를 찾을 수 있을 때)
		if (interaction.inCachedGuild()) {
			const createdAt = Math.floor(target.createdTimestamp / 1000);
			lines.push(`${emoji('calendar')} **계정 생성일**: <t:${createdAt}:R>`);
			if (member?.joinedTimestamp) {
				const joinedAt = Math.floor(member.joinedTimestamp / 1000);
				lines.push(`${emoji('inbox_tray')} **서버 참가일**: <t:${joinedAt}:R>`);
				const roles = member.roles.cache
					.filter((role) => role.id !== interaction.guildId)
					.sort((a, b) => b.position - a.position)
					.map((role) => `<@&${role.id}>`)
					.slice(0, 10);
				if (roles.length > 0) {
					const totalRoles = member.roles.cache.size - 1; // @everyone 제외
					lines.push(
						`${emoji('mask')} **역할** (${totalRoles}개): ${roles.join(', ')}${totalRoles > 10 ? ` 외 ${totalRoles - 10}개` : ''}`
					);
				}
				if (member.premiumSinceTimestamp) {
					lines.push(`${emoji('sparkle')} **부스터**: <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>부터`);
				}
			}
		}

		// 음악 기록
		lines.push('');
		if (data.requestedCount > 0) {
			const listen = formatTimeToKorean(Math.floor(data.listenMs / 1000));
			lines.push(
				`${emoji('music_note')} **플레이리스트**: ${data.playlistCount}개 · **신청한 곡**: ${data.requestedCount}곡 · **총 청취**: ${listen}${
					data.listenSampled ? ' (최근 500건 기준)' : ''
				}`
			);
		} else {
			lines.push(`${emoji('music_note')} **플레이리스트**: ${data.playlistCount}개 · **신청한 곡**: 아직 없어요`);
		}
		if (data.topTracks.length > 0) {
			lines.push('');
			lines.push(`${emoji('trophy')} **자주 신청한 곡**`);
			data.topTracks.forEach((t, i) => {
				lines.push(`${i + 1}. ${t.title}${t.artist ? ` · ${t.artist}` : ''} (${t.count}회)`);
			});
		}
		if (data.recentTracks.length > 0) {
			lines.push('');
			lines.push(`${emoji('clock')} **최근 신청한 곡**`);
			for (const t of data.recentTracks) {
				const at = Math.floor(t.playedAt.getTime() / 1000);
				lines.push(`· ${t.title}${t.artist ? ` · ${t.artist}` : ''} (<t:${at}:R>)`);
			}
		}
		const gameLines = formatGameStatsLines(data.gameStats);
		if (gameLines) {
			lines.push('');
			lines.push(...gameLines);
		}
		if (data.requestedCount === 0) {
			lines.push('-# `/재생`으로 첫 곡을 신청해 보세요.');
		} else if (data.inGuild) {
			lines.push('-# 음악 기록은 이 서버 기준 집계예요.');
		} else {
			lines.push('-# 음악 기록은 전체 서버 기준 집계예요.');
		}

		const avatarUrl = target.displayAvatarURL({ size: 256 });
		const containerComponent = createContainer();
		const section = new SectionBuilder()
			.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')))
			.setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
		containerComponent.addSectionComponents(section);

		await interaction.editReply({
			components: [containerComponent],
			flags: [MessageFlags.IsComponentsV2]
		});
	}
}
