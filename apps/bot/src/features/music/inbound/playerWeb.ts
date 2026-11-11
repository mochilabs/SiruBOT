/**
 * 웹 플레이어 응답자 — 대시보드 검색·재생·제어·음성 상태 요청 → data-api Redis 요청 → 봇 해석 → Redis 응답.
 *
 * 요청자의 음성 채널과 관리자/DJ 권한은 봇 캐시로만 해석할 수 있으므로 guildData 응답과 같은
 * request/reply 흐름으로 동작해요. data-api playerWebHub가 Redis 채널(`sirubot:player-web:request`)로
 * {requestId, guildId, userId, kind, ...}를 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 응답자가
 * 멤버·음성 채널·권한을 판정해 실제 동작(검색/접속/큐잉/제어)을 수행한 뒤
 * `sirubot:player-web:response` 채널로 응답해요. 수신·검증·응답 골격은 lib/redisResponder.ts가 맡아요.
 *
 * - 요청 계약(playerWebRpc)은 공통부만 검증해요. kind별 상세는 여기서 해당 스키마로 좁히고,
 *   어긋나면 '요청 형식이 올바르지 않아요.'로 응답해요 (타임아웃 대신 안내문을 보게 해요).
 * - 검증 실패(음성 미접속·권한 없음·노드 없음·검색 결과 없음)는 한국어 error 메시지로 응답해요 —
 *   data-api가 그대로 400으로 전달해 대시보드에서 안내해요.
 */
import { container, UserError } from '@sapphire/framework';
import {
	playerWebControlRequestSchema,
	playerWebPlayRequestSchema,
	playerWebRpc,
	playerWebSearchRequestSchema,
	playerWebVoiceContextRequestSchema,
	VOICE_CHANNEL_REQUIRED_MESSAGE
} from '@sirubot/utils';
import type {
	PlayerWebControlRequest,
	PlayerWebPlayRequest,
	PlayerWebSearchRequest,
	PlayerWebTrack,
	PlayerWebVoiceContextRequest
} from '@sirubot/utils';
import { MessageFlags, type Channel, type ContainerBuilder, type Guild, type GuildMember } from 'discord.js';
import { type Player, type SearchResult, type Track, type UnresolvedTrack } from 'lavalink-client';
import * as playView from '../../../modules/audio/view/play.ts';
import { DEFAULT_RESPONDER_ERROR_MESSAGE, createRedisResponder, type RedisBinding, type RedisRpcPayload } from '../../../lib/redisResponder.ts';
import type { RedisLogger } from '../../../lib/redisPublisher.ts';
import * as guildChannels from '../../../services/guildSettings/channels.ts';
import * as guildPlayback from '../../../services/guildSettings/playback.ts';
import { actorFromMember } from '../application/actor.ts';
import { canAddTracks, canControlMusic } from '../application/access.ts';

type Payload = RedisRpcPayload<typeof playerWebRpc>;

/** 검색 결과로 돌려줄 최대 트랙 수 — 웹 선택 UI 목록 크기 */
const MAX_TRACKS = 5;
/** 같은 유저의 재생 요청 쿨다운(ms) — commandChannel 고정 채널 리스너와 같은 도배 방지 */
const PLAY_COOLDOWN_MS = 2_500;

interface WebPlayerContext extends Record<string, unknown> {
	command: string;
	guildId: string;
	voiceChannelId?: string;
	textChannelId?: string;
}

/** 퍼블리시 가능한 연결된 노드 — NodeAvailable 프리컨디션과 같은 기준 */
function findConnectedNode() {
	for (const node of container.audio.nodeManager.nodes.values()) {
		if (node.connected) return node;
	}
	return null;
}

/** 검색 결과를 웹 응답 요약으로 변환 — info 필드만 노출해요 (raw Track 객체는 스키마에 안 맞아요) */
function toTrackSummaries(searchRes: SearchResult): PlayerWebTrack[] {
	return searchRes.tracks.slice(0, MAX_TRACKS).map((track) => ({
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

/** 웹 플레이어 응답자를 만들어요 — 재생 중복 방지·쿨다운 상태는 이 인스턴스의 클로저에 있어요 */
export function createPlayerWebResponder(): RedisBinding {
	const inFlight = new Set<string>();
	const cooldowns = new Map<string, number>();

	/** 쿨다운 맵이 커지는 것을 막는다 — commandChannel pruneCooldowns과 같은 규칙 */
	const pruneCooldowns = (): void => {
		if (cooldowns.size < 1000) return;
		for (const [key, timestamp] of cooldowns) {
			if (Date.now() - timestamp > 10_000) cooldowns.delete(key);
		}
	};

	// kind: voice-context, 사용자 음성·권한 상태만 돌려줘요 (권한 제한 없음)
	const handleVoiceContext = async (guild: Guild, request: PlayerWebVoiceContextRequest): Promise<Payload> => {
		const member = await fetchMember(guild, request.userId);
		if (!member) return { error: MEMBER_NOT_FOUND_MESSAGE };
		const voiceChannelId = member.voice?.channelId ?? null;
		const voiceChannel = voiceChannelId ? guild.channels.cache.get(voiceChannelId) : null;
		return {
			voice: {
				inVoice: Boolean(voiceChannelId),
				voiceChannelName: voiceChannel?.name ?? null,
				...(await musicCapabilities(guild, member))
			}
		};
	};

	// kind: search, 검색 결과 5개 요약. 재생 전제 검증(음성·권한·채널 충돌)을 미리 적용해요
	const handleSearch = async (guild: Guild, request: PlayerWebSearchRequest): Promise<Payload> => {
		const verified = await verifyPlaybackRequest(guild, request.userId);
		if ('error' in verified) return { error: verified.error };
		const node = findConnectedNode();
		if (!node) return { error: `현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.` };

		const searchRes = await node.search({ query: request.query, source: 'ytsearch' as const }, verified.requester);
		if (searchRes.loadType === 'error' || searchRes.tracks.length === 0) {
			return { error: `검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.` };
		}
		return { tracks: toTrackSummaries(searchRes) };
	};

	// kind: play, 선택한 트랙 URI(또는 다시 재생 URL·플레이리스트)를 검색해 큐에 넣고 재생을 보장해요
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

		const verified = await verifyPlaybackRequest(guild, request.userId);
		if ('error' in verified) return { error: verified.error };

		cooldowns.set(cooldownKey, Date.now());
		pruneCooldowns();
		inFlight.add(guildId);
		try {
			const context: WebPlayerContext = {
				command: 'webPlayer',
				guildId,
				voiceChannelId: verified.voiceChannelId,
				textChannelId: verified.textChannelId ?? undefined
			};

			// commandChannel·/재생과 같은 순서: 생성 → 검색 → 접속 → 큐잉 → 재생 보장
			const player = await container.audioService.getOrCreatePlayer(guildId, verified.voiceChannelId, verified.textChannelId);
			if (verified.textChannelId) player.textChannelId = verified.textChannelId;

			const searchRes = await container.audioService.search(player, request.uri, 'ytsearch', verified.requester, context);
			await container.audioService.connectPlayer(player, context);

			if (searchRes.playlist) {
				// 플레이리스트 URL — 선택 UI가 없어 전체를 한 번에 큐에 넣어요 (웹 MVP 범위)
				const tracks = searchRes.tracks as Track[];
				const { wasIdle } = await container.audioService.enqueueTrack(player, tracks);
				const track = searchRes.playlist.selectedTrack ?? tracks[0];
				if (track) {
					await sendFeedbackMessage(logger, guildId, player.textChannelId, await buildFeedback(player, track, request.userId, wasIdle));
				}
			} else {
				const track = searchRes.tracks[0] as Track | UnresolvedTrack | undefined;
				if (!track) throw new Error(`web play: 검색 결과 트랙이 없어요 (guild ${guildId}, uri ${request.uri})`);
				const { wasIdle } = await container.audioService.enqueueTrack(player, track);
				await sendFeedbackMessage(logger, guildId, player.textChannelId, await buildFeedback(player, track, request.userId, wasIdle));
			}

			await container.audioService.ensurePlayback(player);
			return {};
		} catch (error) {
			// audioService가 던지는 UserError(검색 결과 없음·음성 접속 불가 등)는 검증 실패예요 — 안내 문구를 그대로 전달해요.
			if (error instanceof UserError) return { error: error.message };
			throw error;
		} finally {
			inFlight.delete(guildId);
		}
	};

	// kind: control, 볼륨·일시정지·재생·스킵·정지·반복
	//   모든 동작은 공용 유스케이스(container.music) — 봇과 같은 음성 채널 + DJ 조건, Administrator만 음성 조건 면제.
	//     repeat는 웹에서 off → track → queue 순으로 순환해요. skip은 투표 없는 즉시 건너뛰기예요.
	//   유스케이스의 AppError는 팩토리가 앱 이모지 마크업을 뗀 안내 문구로 응답해요.
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
			// kind별 상세 스키마 검증 실패 — 봇 검증 실패로 응답해 대시보드가 타임아웃 대신 안내문을 봐요
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

/** 제어 동작을 유스케이스로 실행해요 (AppError는 팩토리가 응답으로 바꿔요). */
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
			// 웹 버튼은 모드를 고르지 않고 off → track → queue 순으로 순환해요. 플레이어가 없으면 저장된 길드 설정을 기준으로 해요.
			const current =
				container.audio.getPlayer(request.guildId)?.repeatMode ?? (await guildPlayback.getRepeat(container.guildService, request.guildId));
			await container.music.setRepeat(actor, current === 'off' ? 'track' : current === 'track' ? 'queue' : 'off');
			return;
		}
		case 'skip':
			await container.music.skipNow(actor);
			return;
	}
}

/**
 * 재생 계열(search/play) 공통 검증 — 멤버·곡 추가 정책(음성 접속·채널 충돌).
 * 성공 시 재생에 필요한 식별자와 요청자 표시를 돌려줘요.
 */
async function verifyPlaybackRequest(
	guild: Guild,
	userId: string
): Promise<{ error: string } | { voiceChannelId: string; textChannelId: string | null; requester: { id: string; username: string } }> {
	const member = await fetchMember(guild, userId);
	if (!member) return { error: MEMBER_NOT_FOUND_MESSAGE };

	// 곡 추가 정책(슬래시 /재생과 동일): 봇과 같은 음성 채널이면 누구나, 원격 권한자는 봇이 채널에 있으면 밖에서도 추가할 수 있어요.
	const actor = actorFromMember(member);
	const botChannelId = botVoiceChannelId(guild);
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guild.id);
	if (!canAddTracks(actor, botChannelId, djRoleId)) {
		if (!actor.voiceChannelId) return { error: `${VOICE_CHANNEL_REQUIRED_MESSAGE}` };
		// 웹에서는 <#id> 멘션이 렌더되지 않으므로 채널 이름으로 풀어서 보내요.
		const playingChannelName = botChannelId ? guild.channels.cache.get(botChannelId)?.name : undefined;
		const where = playingChannelName ? `다른 음성 채널(${playingChannelName})` : '다른 음성 채널';
		return {
			error: `${where}에서 재생 중이에요. 같은 채널에 접속하거나 정지한 뒤 시도해 주세요.`
		};
	}
	// 봇이 이미 채널에 있으면 그 채널에 추가하고(원격 권한자 포함), 없으면 요청자의 채널로 들어가요.
	const voiceChannelId = botChannelId ?? actor.voiceChannelId;
	if (!voiceChannelId) return { error: `${VOICE_CHANNEL_REQUIRED_MESSAGE}` };

	// 텍스트 채널 정책: 고정 채널 우선, 없으면 시스템 채널 (컨트롤러/피드백 메시지 대상)
	const pinned = await guildChannels.getPinnedChannel(container.guildService, guild.id);
	return {
		voiceChannelId,
		textChannelId: pinned ?? guild.systemChannelId ?? null,
		requester: { id: userId, username: member.displayName }
	};
}

async function fetchMember(guild: Guild | null, userId: string): Promise<GuildMember | null> {
	if (!guild) return null;
	const cached = guild.members.cache.get(userId);
	if (cached) return cached;
	return guild.members.fetch(userId).catch(() => null);
}

/** 봇이 접속한 음성 채널 — 음악 제어 인가 정책(`container.music`)과 같은 기준이에요. */
function botVoiceChannelId(guild: Guild): string | null {
	return guild.members.me?.voice.channelId ?? container.audio.getPlayer(guild.id)?.voiceChannelId ?? null;
}

/** 대시보드가 버튼을 미리 비활성화하는 데 쓰는 플래그 — 실제 인가와 같은 정책 함수로 계산해요. */
async function musicCapabilities(guild: Guild, member: GuildMember): Promise<{ canPlay: boolean; canControl: boolean }> {
	const actor = actorFromMember(member);
	const botChannelId = botVoiceChannelId(guild);
	const djRoleId = await guildPlayback.getDJRole(container.guildService, guild.id);
	return {
		canPlay: canAddTracks(actor, botChannelId, djRoleId),
		canControl: canControlMusic(actor, botChannelId, djRoleId)
	};
}

/** 재생 피드백 컨테이너 — commandChannel buildFeedback과 동일한 분기(시작/추가)예요 */
async function buildFeedback(player: Player, track: Track | UnresolvedTrack, userId: string, wasIdle: boolean) {
	if (wasIdle && (await container.audioService.isControllerEnabled(player.guildId))) {
		return [playView.playStarted({ track: track as Track, userId })];
	}
	return [playView.trackAdded(playView.trackAddedProps(player, track as Track))];
}

/** 고정 채널(또는 시스템 채널)에 재생 피드백을 보내요 — Discord 참여자가 웹에서의 재생을 볼 수 있게 해요 */
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
