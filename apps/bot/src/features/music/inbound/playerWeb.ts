import { container } from '@sapphire/framework';
import {
	playerWebControlRequestSchema,
	playerWebPlayRequestSchema,
	playerWebRpc,
	playerWebSearchRequestSchema,
	playerWebVoiceContextRequestSchema
} from '@sirubot/utils';
import type {
	PlayerWebControlRequest,
	PlayerWebPlayRequest,
	PlayerWebSearchRequest,
	PlayerWebTrack,
	PlayerWebVoiceContextRequest
} from '@sirubot/utils';
import { MessageFlags, type Channel, type ContainerBuilder, type Guild, type GuildMember } from 'discord.js';
import type { Track, UnresolvedTrack } from 'lavalink-client';
import { trackPlayFeedback } from '../discord/utils/playFeedback.ts';
import { AppError } from '../../../lib/appError.ts';
import { DEFAULT_RESPONDER_ERROR_MESSAGE, createRedisResponder, type RedisBinding, type RedisRpcPayload } from '../../../lib/redisResponder.ts';
import type { RedisLogger } from '../../../lib/redisPublisher.ts';
import * as guildChannels from '../../../services/guildSettings/channels.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';
import { actorFromMember, type Actor } from '../application/actor.ts';
import { canAddTracks, canControlMusic, createMusicAccess, MUSIC_ACCESS_MESSAGES } from '../application/access.ts';
import type { MusicRequester } from '../application/play.ts';
import { getUserQueuedTracks, removeStaleRelatedTracks } from '../lavalink/autoPlayRelated.ts';
import { publishPlayerState } from '../lavalink/playerStatePublisher.ts';
import { getConfig } from '../../../lib/config.ts';

type Payload = RedisRpcPayload<typeof playerWebRpc>;

const MAX_TRACKS = 5;
const PLAY_COOLDOWN_MS = 2_500;

function toTrackSummaries(tracks: readonly (Track | UnresolvedTrack)[]): PlayerWebTrack[] {
	return tracks.slice(0, MAX_TRACKS).map((track) => ({
		title: track.info.title?.slice(0, 200) ?? '알 수 없는 곡',
		author: track.info.author?.slice(0, 120) ?? '알 수 없는 아티스트',
		durationMs: track.info.duration ?? 0,
		artworkUrl: track.info.artworkUrl ?? null,
		uri: track.info.uri ?? '',
		sourceName: typeof track.info.sourceName === 'string' ? track.info.sourceName : null,
		isStream: track.info.isStream ?? false
	}));
}

const INVALID_PAYLOAD_MESSAGE = '요청 형식이 올바르지 않아요.';
const MEMBER_NOT_FOUND_MESSAGE = '서버에서 회원님을 찾을 수 없어요.';

export function createPlayerWebResponder(): RedisBinding {
	const inFlight = new Set<string>();
	const cooldowns = new Map<string, number>();

	const pruneCooldowns = (): void => {
		if (cooldowns.size < 1000) return;
		for (const [key, timestamp] of cooldowns) {
			if (Date.now() - timestamp > 10_000) cooldowns.delete(key);
		}
	};

	const handleVoiceContext = async (guild: Guild, request: PlayerWebVoiceContextRequest): Promise<Payload> => {
		const member = await fetchMember(guild, request.userId);
		if (!member) return { error: MEMBER_NOT_FOUND_MESSAGE };
		const voiceChannelId = member.voice?.channelId ?? null;
		const voiceChannel = voiceChannelId ? guild.channels.cache.get(voiceChannelId) : null;
		const botChannelId = botVoiceChannelId(guild);
		return {
			voice: {
				inVoice: Boolean(voiceChannelId),
				voiceChannelName: voiceChannel?.name ?? null,
				botVoiceChannelName: (botChannelId ? guild.channels.cache.get(botChannelId)?.name : null) ?? null,
				...(await musicCapabilities(guild, member))
			}
		};
	};

	const handleSearch = async (guild: Guild, request: PlayerWebSearchRequest): Promise<Payload> => {
		const playback = await resolvePlaybackMember(guild, request.userId);
		if ('error' in playback) return { error: playback.error };
		const outcome = await container.musicPlay.preview(playback.actor, {
			query: request.query,
			platform: 'ytsearch',
			requester: playback.requester
		});
		return { tracks: toTrackSummaries(outcome.tracks) };
	};

	const handlePlay = async (guild: Guild, request: PlayerWebPlayRequest, logger: RedisLogger): Promise<Payload> => {
		const { guildId } = request;
		if (inFlight.has(guildId)) {
			return { error: `이 서버의 이전 재생 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.` };
		}

		const cooldownKey = `${guildId}:${request.userId}`;
		const last = cooldowns.get(cooldownKey) ?? 0;
		if (Date.now() - last < PLAY_COOLDOWN_MS) {
			return { error: `너무 빠르게 연속 요청하고 있어요. 잠시 후 다시 시도해 주세요.` };
		}

		const playback = await resolvePlaybackMember(guild, request.userId);
		if ('error' in playback) return { error: playback.error };

		cooldowns.set(cooldownKey, Date.now());
		pruneCooldowns();
		inFlight.add(guildId);
		try {
			const result = await container.musicPlay.play(
				playback.actor,
				{
					query: request.uri,
					platform: 'ytsearch',
					requester: playback.requester,
					textChannelId: playback.textChannelId,
					pinTextChannel: playback.pinTextChannel
				},
				{ kind: 'all' }
			);

			const track = result.playlist?.selectedTrack ?? result.queued[0];
			if (!track) throw new Error(`web play: 검색 결과 트랙이 없어요 (guild ${guildId}, uri ${request.uri})`);
			const panelChannelId = await guildChannels.getPanelChannel(container.guildService, guildId);
			if (!panelChannelId || panelChannelId !== result.player.textChannelId) {
				await sendFeedbackMessage(
					logger,
					guildId,
					result.player.textChannelId,
					await trackPlayFeedback(result.player, track, request.userId, result.wasIdle, {
						fromDashboard: { url: dashboardServerUrl(guildId) }
					})
				);
			}
			return {};
		} finally {
			inFlight.delete(guildId);
		}
	};

	const handleControl = async (guild: Guild, request: PlayerWebControlRequest): Promise<Payload> => {
		const member = await fetchMember(guild, request.userId);
		if (!member) return { error: MEMBER_NOT_FOUND_MESSAGE };
		await applyMusicControl(request, member);
		return {};
	};

	return createRedisResponder(
		playerWebRpc,
		async ({ guild, request, logger }) => {
			const { guildId, kind } = request;
			const rejectPayload = (): Payload => {
				logger.debug(`웹 플레이어 ${kind} 요청 본문 검증 실패 (guild ${guildId})`);
				return { error: INVALID_PAYLOAD_MESSAGE };
			};
			switch (kind) {
				case 'voice-context': {
					const parsed = playerWebVoiceContextRequestSchema.safeParse(request);
					return parsed.success ? handleVoiceContext(guild, parsed.data) : rejectPayload();
				}
				case 'search': {
					const parsed = playerWebSearchRequestSchema.safeParse(request);
					return parsed.success ? handleSearch(guild, parsed.data) : rejectPayload();
				}
				case 'play': {
					const parsed = playerWebPlayRequestSchema.safeParse(request);
					return parsed.success ? handlePlay(guild, parsed.data, logger) : rejectPayload();
				}
				case 'control': {
					const parsed = playerWebControlRequestSchema.safeParse(request);
					return parsed.success ? handleControl(guild, parsed.data) : rejectPayload();
				}
			}
		},
		{
			errorMessage: (request) =>
				request.kind === 'control' ? '제어를 적용하지 못했어요. 잠시 후 다시 시도해 주세요.' : DEFAULT_RESPONDER_ERROR_MESSAGE
		}
	);
}

async function applyMusicControl(request: PlayerWebControlRequest, member: GuildMember): Promise<void> {
	const actor = actorFromMember(member);
	switch (request.action) {
		case 'volume':
			if (typeof request.value !== 'number') throw new Error(`control volume: value 누락 (guild ${request.guildId})`);
			await container.music.setVolume(actor, request.value);
			return;
		case 'pause':
			await container.music.pause(actor);
			return;
		case 'resume':
			await container.music.resume(actor);
			return;
		case 'stop':
			await container.music.stop(actor);
			return;
		case 'repeat': {
			const current =
				container.audio.getPlayer(request.guildId)?.repeatMode ?? (await guildPlayback.getRepeat(container.guildService, request.guildId));
			await container.music.setRepeat(actor, current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off');
			return;
		}
		case 'skip':
			await container.music.skipNow(actor);
			return;
		case 'previous':
			await container.music.previous(actor);
			return;
		case 'seek':
			if (typeof request.positionMs !== 'number') throw new Error(`control seek: positionMs 누락 (guild ${request.guildId})`);
			await container.music.seek(actor, request.positionMs);
			return;
		case 'queue-jump':
			if (typeof request.index !== 'number') throw new Error(`control queue-jump: index 누락 (guild ${request.guildId})`);
			await container.music.skipNow(actor, { to: request.index + 1 });
			return;
		case 'queue-shuffle':
		case 'queue-clear':
		case 'queue-remove':
		case 'queue-move':
			await applyQueueControl(request, member.guild, actor);
			return;
	}
}

async function applyQueueControl(request: PlayerWebControlRequest, guild: Guild, actor: Actor): Promise<void> {
	const access = createMusicAccess({
		getBotVoiceChannelId: () => botVoiceChannelId(guild),
		getDjRoleId: (guildId) => guildPlayback.getDJRole(container.guildService, guildId)
	});
	await access.authorize(actor);

	const player = container.audio.getPlayer(request.guildId);
	if (!player) throw new AppError('not_found', MUSIC_ACCESS_MESSAGES.noSong(), { ephemeral: true });

	const userTracks = getUserQueuedTracks(player);

	switch (request.action) {
		case 'queue-shuffle': {
			if (userTracks.length < 2) {
				throw new AppError('invalid_input', '셔플할 곡이 2곡 이상 필요해요.', { ephemeral: true });
			}
			await removeStaleRelatedTracks(container.lavalink, player);
			await player.queue.shuffle();
			break;
		}
		case 'queue-clear': {
			if (userTracks.length === 0) {
				throw new AppError('not_found', '대기열이 비어 있어요.', { ephemeral: true });
			}
			await player.queue.splice(0, userTracks.length);
			break;
		}
		case 'queue-remove': {
			const { index } = request;
			if (typeof index !== 'number' || index < 0 || index >= userTracks.length) {
				throw new AppError('not_found', '해당 번호의 곡이 대기열에 없어요.', { ephemeral: true });
			}
			await player.queue.splice(index, 1);
			break;
		}
		case 'queue-move': {
			const { from, to } = request;
			if (typeof from !== 'number' || typeof to !== 'number' || from < 0 || to < 0 || from >= userTracks.length || to >= userTracks.length) {
				throw new AppError('not_found', '해당 번호의 곡이 대기열에 없어요.', { ephemeral: true });
			}
			if (from === to) {
				throw new AppError('invalid_input', '같은 위치로는 이동할 수 없어요.', { ephemeral: true });
			}
			const removed = await player.queue.splice(from, 1);
			const track = Array.isArray(removed) ? removed[0] : removed;
			if (!track) throw new AppError('not_found', '해당 곡을 찾을 수 없어요.', { ephemeral: true });
			await player.queue.splice(to, 0, track);
			break;
		}
	}

	void container.mixerService.preloadUpcoming(player).catch(() => null);
	publishPlayerState(container.lavalink, player);
}

async function resolvePlaybackMember(
	guild: Guild,
	userId: string
): Promise<{ error: string } | { actor: Actor; requester: MusicRequester; textChannelId: string | null; pinTextChannel: boolean }> {
	const member = await fetchMember(guild, userId);
	if (!member) return { error: MEMBER_NOT_FOUND_MESSAGE };
	const defaultChannel = await guildChannels.getDefaultTextChannel(container.guildService, guild.id);
	// 이미 컨트롤러가 떠 있는 플레이어의 채널은 덮어쓰지 않아요 — 덮어쓰면 컨트롤러 메시지와 채널이 어긋나 갱신이 멈춰요.
	const existingChannel = container.audio.getPlayer(guild.id)?.textChannelId ?? null;
	return {
		actor: actorFromMember(member),
		requester: { id: userId, username: member.displayName },
		textChannelId: defaultChannel ?? existingChannel ?? guild.systemChannelId ?? null,
		pinTextChannel: defaultChannel !== null
	};
}

async function fetchMember(guild: Guild | null, userId: string): Promise<GuildMember | null> {
	if (!guild) return null;
	const cached = guild.members.cache.get(userId);
	if (cached) return cached;
	return guild.members.fetch(userId).catch(() => null);
}

function dashboardServerUrl(guildId: string): string | null {
	const base = getConfig().links.dashboardUrl;
	return base ? `${base}/servers/${guildId}` : null;
}

function botVoiceChannelId(guild: Guild): string | null {
	return guild.members.me?.voice.channelId ?? container.audio.getPlayer(guild.id)?.voiceChannelId ?? null;
}

async function musicCapabilities(guild: Guild, member: GuildMember): Promise<{ canPlay: boolean; canControl: boolean }> {
	const actor = actorFromMember(member);
	const botChannelId = botVoiceChannelId(guild);
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guild.id);
	return {
		canPlay: canAddTracks(actor, botChannelId, djRoleId),
		canControl: canControlMusic(actor, botChannelId, djRoleId)
	};
}

async function sendFeedbackMessage(
	logger: RedisLogger,
	guildId: string,
	textChannelId: string | null | undefined,
	components: ContainerBuilder[]
): Promise<void> {
	if (!textChannelId) return;
	const guild = container.client.guilds.cache.get(guildId);
	const channel: Channel | undefined = guild?.channels.cache.get(textChannelId);
	if (!channel?.isTextBased()) return;
	await channel
		.send({
			flags: MessageFlags.IsComponentsV2,
			components,
			allowedMentions: { users: [], roles: [] }
		})
		.catch((error) => logger.warn(`웹 플레이어 피드백 전송 실패 (guild ${guildId}): ${error}`));
}
