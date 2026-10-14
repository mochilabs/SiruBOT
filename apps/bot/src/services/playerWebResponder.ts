/**
 * 웹 플레이어 응답자 — 대시보드 검색·재생·제어·음성 상태 요청 → data-api Redis 요청 → 봇 해석 → Redis 응답.
 *
 * 요청자의 음성 채널과 관리자/DJ 권한은 봇 캐시로만 해석할 수 있으므로 guildData 응답과 같은
 * request/reply 흐름으로 동작해요. data-api playerWebHub가 Redis 채널(`sirubot:player-web:request`)로
 * {requestId, guildId, userId, kind, ...}를 브로드캐스트하면, 그 길드를 보유한 봇 프로세스만 이 응답자가
 * 멤버·음성 채널·권한을 판정해 실제 동작(검색/접속/큐잉/제어)을 수행한 뒤
 * `sirubot:player-web:response` 채널로 응답해요.
 *
 * - 이 프로세스가 보유하지 않은 길드면 조용히 무시해요 — 다른 레플리카가 응답해요.
 *   아무도 응답하지 않으면 data-api가 kind별 타임아웃으로 처리해요.
 * - 검증 실패(음성 미접속·권한 없음·노드 없음·검색 결과 없음)는 한국어 error 메시지로 응답해요 —
 *   data-api가 그대로 400으로 전달해 대시보드에서 안내해요.
 * - 어떤 경우에도 절대 throw하지 않아요 — 처리 실패는 대시보드의 타임아웃 폴백으로 이어져요.
 */
import { container, UserError } from '@sapphire/framework';
import {
	emoji,
	ManagedRedisSubscriber,
	PLAYER_WEB_REQUEST_CHANNEL,
	VOICE_CHANNEL_REQUIRED_MESSAGE,
	playerWebControlRequestSchema,
	playerWebPlayRequestSchema,
	playerWebRequestBaseSchema,
	playerWebSearchRequestSchema,
	playerWebVoiceContextRequestSchema
} from '@sirubot/utils';
import type {
	PlayerWebControlRequest,
	PlayerWebPlayRequest,
	PlayerWebRequestBase,
	PlayerWebResponse,
	PlayerWebSearchRequest,
	PlayerWebTrack,
	PlayerWebVoiceContextRequest
} from '@sirubot/utils';
import { MessageFlags, PermissionsBitField, type Channel, type ContainerBuilder, type Guild, type GuildMember } from 'discord.js';
import { type Player, type SearchResult, type Track, type UnresolvedTrack } from 'lavalink-client';
import * as playView from '../modules/audio/view/play.ts';

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

export class PlayerWebResponder {
	private subscriber: ManagedRedisSubscriber | null = null;
	private readonly inFlight = new Set<string>();
	private readonly cooldowns = new Map<string, number>();

	public constructor(
		private readonly logger: { info(msg: string): void; warn(msg: string): void; error(msg: string): void; debug(msg: string): void }
	) {}

	/**
	 * 구독을 시작해요. 실패해도 throw하지 않아요 — 대시보드 플레이어 요청만 타임아웃 폴백으로 끝나고,
	 * 전용 구독 관리자가 자체 백오프(5s→60s)로 재연결을 시도해요.
	 */
	public async start(redisUrl: string | undefined): Promise<void> {
		const url = redisUrl?.trim() || null;
		if (!url) {
			this.logger.warn('REDIS_URL 미설정: 웹 플레이어 요청 구독 없이 동작해요 (대시보드 검색·재생·제어는 타임아웃 폴백해요)');
			return;
		}
		this.subscriber = new ManagedRedisSubscriber({
			name: '웹 플레이어',
			url,
			logger: this.logger,
			bindings: [{ channel: PLAYER_WEB_REQUEST_CHANNEL, onMessage: (raw) => void this.handleRequest(raw) }]
		});
		await this.subscriber.start();
	}

	/** 종료 — 구독 해제 후 연결을 닫아요. 호출자(shutdown)는 redisStore.disconnect() 전에 불러야 해요. */
	public async stop(): Promise<void> {
		const subscriber = this.subscriber;
		this.subscriber = null;
		await subscriber?.stop();
	}

	private async handleRequest(raw: string): Promise<void> {
		let payload: unknown;
		try {
			payload = JSON.parse(raw);
		} catch {
			this.logger.debug(`웹 플레이어 요청이 JSON이 아니어서 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const base = playerWebRequestBaseSchema.safeParse(payload);
		if (!base.success) {
			this.logger.debug(`웹 플레이어 요청 페이로드 형식 불일치, 무시: ${raw.slice(0, 100)}`);
			return;
		}
		const { requestId, guildId, kind } = base.data;
		const guild = container.client.guilds.cache.get(guildId);
		if (!guild) return; // 다른 레플리카가 보유한 길드 — 그쪽이 응답해요 (아무도 없으면 data-api 타임아웃)

		try {
			if (kind === 'voice-context') {
				const request = playerWebVoiceContextRequestSchema.safeParse(payload);
				if (request.success) await this.handleVoiceContext(guild, request.data);
				else this.rejectPayload(requestId, guildId, kind);
				return;
			}
			if (kind === 'search') {
				const request = playerWebSearchRequestSchema.safeParse(payload);
				if (request.success) await this.handleSearch(guild, request.data);
				else this.rejectPayload(requestId, guildId, kind);
				return;
			}
			if (kind === 'play') {
				const request = playerWebPlayRequestSchema.safeParse(payload);
				if (request.success) await this.handlePlay(guild, request.data);
				else this.rejectPayload(requestId, guildId, kind);
				return;
			}
			if (kind === 'control') {
				const request = playerWebControlRequestSchema.safeParse(payload);
				if (request.success) await this.handleControl(guild, request.data);
				else this.rejectPayload(requestId, guildId, kind);
				return;
			}
			this.logger.debug(`알 수 없는 웹 플레이어 요청 kind, 무시: ${kind}`);
		} catch (error) {
			this.logger.error(
				`웹 플레이어 요청 처리 실패 (guild ${guildId}, kind ${kind}): ${error instanceof Error ? error.message : String(error)}`
			);
			this.respond({ requestId, guildId, kind, error: `${emoji('error')} 처리 중 오류가 발생했어요. 잠시 후 다시 시도해 주세요.` });
		}
	}

	/** kind별 상세 스키마 검증 실패 — 봇 검증 실패로 응답해 대시보드가 타임아웃 대신 안내문을 봐요 */
	private rejectPayload(requestId: string, guildId: string, kind: PlayerWebRequestBase['kind']): void {
		this.logger.debug(`웹 플레이어 ${kind} 요청 본문 검증 실패 (guild ${guildId})`);
		this.respond({ requestId, guildId, kind, error: `${emoji('error')} 요청 형식이 올바르지 않아요.` });
	}

	// ── kind: voice-context ── 사용자 음성·권한 상태만 돌려줘요 (권한 제한 없음)
	private async handleVoiceContext(guild: Guild, request: PlayerWebVoiceContextRequest): Promise<void> {
		const member = await this.fetchMember(guild, request.userId);
		if (!member) {
			this.respond({
				requestId: request.requestId,
				guildId: request.guildId,
				kind: 'voice-context',
				error: '서버에서 회원님을 찾을 수 없어요.'
			});
			return;
		}
		const voiceChannelId = member.voice?.channelId ?? null;
		const voiceChannel = voiceChannelId ? guild.channels.cache.get(voiceChannelId) : null;
		this.respond({
			requestId: request.requestId,
			guildId: request.guildId,
			kind: 'voice-context',
			voice: {
				inVoice: Boolean(voiceChannelId),
				voiceChannelName: voiceChannel?.name ?? null,
				canControl: await this.hasControlPermission(request.guildId, member)
			}
		});
	}

	// ── kind: search ── 검색 결과 5개 요약. 재생 전제 검증(음성·권한·채널 충돌)을 미리 적용해요
	private async handleSearch(guild: Guild, request: PlayerWebSearchRequest): Promise<void> {
		const verified = await this.verifyPlaybackRequest(guild, request.userId);
		if ('error' in verified) {
			this.respond({ requestId: request.requestId, guildId: request.guildId, kind: 'search', error: verified.error });
			return;
		}
		const node = findConnectedNode();
		if (!node) {
			this.respond({
				requestId: request.requestId,
				guildId: request.guildId,
				kind: 'search',
				error: `${emoji('bulb')} 현재 사용 가능한 노드가 없어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		const searchRes = await node.search({ query: request.query, source: 'ytsearch' as const }, verified.requester);
		if (searchRes.loadType === 'error' || searchRes.tracks.length === 0) {
			this.respond({
				requestId: request.requestId,
				guildId: request.guildId,
				kind: 'search',
				error: `${emoji('magnet')} 검색 결과가 없어요. 다른 검색어로 다시 시도해 주세요.`
			});
			return;
		}
		this.respond({
			requestId: request.requestId,
			guildId: request.guildId,
			kind: 'search',
			tracks: toTrackSummaries(searchRes)
		});
	}

	// ── kind: play ── 선택한 트랙 URI(또는 다시 재생 URL·플레이리스트)를 검색해 큐에 넣고 재생을 보장해요
	private async handlePlay(guild: Guild, request: PlayerWebPlayRequest): Promise<void> {
		const { guildId } = request;
		if (this.inFlight.has(guildId)) {
			this.respond({
				requestId: request.requestId,
				guildId,
				kind: 'play',
				error: `${emoji('bulb')} 이 서버의 이전 재생 요청을 아직 처리하고 있어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		const cooldownKey = `${guildId}:${request.userId}`;
		const last = this.cooldowns.get(cooldownKey) ?? 0;
		if (Date.now() - last < PLAY_COOLDOWN_MS) {
			this.respond({
				requestId: request.requestId,
				guildId,
				kind: 'play',
				error: `${emoji('bulb')} 너무 빠르게 연속 요청하고 있어요. 잠시 후 다시 시도해 주세요.`
			});
			return;
		}

		const verified = await this.verifyPlaybackRequest(guild, request.userId);
		if ('error' in verified) {
			this.respond({ requestId: request.requestId, guildId, kind: 'play', error: verified.error });
			return;
		}

		this.cooldowns.set(cooldownKey, Date.now());
		this.pruneCooldowns();
		this.inFlight.add(guildId);
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
					await this.sendFeedbackMessage(guildId, player.textChannelId, await this.buildFeedback(player, track, request.userId, wasIdle));
				}
			} else {
				const track = searchRes.tracks[0] as Track | UnresolvedTrack | undefined;
				if (!track) throw new Error(`web play: 검색 결과 트랙이 없어요 (guild ${guildId}, uri ${request.uri})`);
				const { wasIdle } = await container.audioService.enqueueTrack(player, track);
				await this.sendFeedbackMessage(guildId, player.textChannelId, await this.buildFeedback(player, track, request.userId, wasIdle));
			}

			await container.audioService.ensurePlayback(player);
			this.respond({ requestId: request.requestId, guildId, kind: 'play' });
		} catch (error) {
			// audioService가 던지는 UserError(검색 결과 없음·음성 접속 불가 등)는 검증 실패예요 — 안내 문구를 그대로 전달해요.
			if (error instanceof UserError) {
				this.respond({ requestId: request.requestId, guildId, kind: 'play', error: error.message });
				return;
			}
			throw error;
		} finally {
			this.inFlight.delete(guildId);
		}
	}

	// ── kind: control ── 볼륨·일시정지·재생·스킵·정지·반복 — 봇 슬래시 커맨드 가드를 웹에 맞게 단순화해요
	//   volume: 관리자/DJ 권한만 (기존 대시보드 라이브 탭 컨트롤러와 같은 동작 — 저장 길드 설정 반영)
	//   pause/resume: 활성 플레이어 필요 (Discord /pause의 DJOrAlone·SongPlaying에 대응)
	//   skip: 활성 플레이어 + 봇과 같은 음성 채널 (Discord /skip의 SameVoiceChannel에 대응)
	//   stop: 활성 플레이어 + 음성 채널 접속 (Discord /stop과 같은 조건)
	private async handleControl(guild: Guild, request: PlayerWebControlRequest): Promise<void> {
		const { guildId } = request;
		try {
			const member = await this.fetchMember(guild, request.userId);
			if (!member) {
				this.respond({ requestId: request.requestId, guildId, kind: 'control', error: '서버에서 회원님을 찾을 수 없어요.' });
				return;
			}
			if (!(await this.hasControlPermission(guildId, member))) {
				this.respond({ requestId: request.requestId, guildId, kind: 'control', error: '재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.' });
				return;
			}

			const player = container.audio.getPlayer(guildId);
			const voiceChannelId = member.voice?.channelId ?? null;

			// 볼륨은 플레이어 유무와 무관하게 저장 길드 설정에 반영 — 기존 라이브 컨트롤러와 같은 동작이에요.
			if (request.action === 'volume') {
				if (typeof request.value !== 'number') throw new Error(`control volume: value 누락 (guild ${guildId})`);
				const { volume } = await container.guildService.updateVolume(guildId, request.value);
				if (player) player.setVolume(volume);
				this.respond({ requestId: request.requestId, guildId, kind: 'control' });
				return;
			}

			if (!player) {
				this.respond({ requestId: request.requestId, guildId, kind: 'control', error: '재생 중인 곡이 없어요.' });
				return;
			}

			if (request.action === 'repeat') {
				const nextMode = player.repeatMode === 'off' ? 'track' : player.repeatMode === 'track' ? 'queue' : 'off';
				const repeatMode = await container.guildService.setRepeat(guildId, nextMode);
				await player.setRepeatMode(repeatMode);
				if (repeatMode !== 'off') await container.mixerService.clearNext(player).catch(() => null);
				this.respond({ requestId: request.requestId, guildId, kind: 'control' });
				return;
			}

			if (request.action === 'skip' && player.voiceChannelId !== voiceChannelId) {
				this.respond({
					requestId: request.requestId,
					guildId,
					kind: 'control',
					error: `${emoji('link')} 이 동작은 봇과 같은 음성 채널에 연결해야 해요.`
				});
				return;
			}
			if (request.action === 'stop' && !voiceChannelId) {
				this.respond({ requestId: request.requestId, guildId, kind: 'control', error: `${emoji('bulb')} ${VOICE_CHANNEL_REQUIRED_MESSAGE}` });
				return;
			}

			if (request.action === 'pause') {
				if (!player.paused) await player.pause();
			} else if (request.action === 'resume') {
				if (player.paused) await player.resume();
			} else if (request.action === 'skip') {
				await container.mixerService.skip(player);
			} else if (request.action === 'stop') {
				// 봇 /stop과 같은 동작 — 큐 정리 후 정지·퇴장
				player.transitionState.stopByCommand = true;
				await container.mixerService.clearNext(player).catch(() => null);
				await player.stopPlaying();
				await player.disconnect();
			}
			this.respond({ requestId: request.requestId, guildId, kind: 'control' });
		} catch (error) {
			this.logger.error(
				`웹 플레이어 제어 적용 실패 (guild ${guildId}, action ${request.action}): ${error instanceof Error ? error.message : String(error)}`
			);
			this.respond({
				requestId: request.requestId,
				guildId,
				kind: 'control',
				error: '제어를 적용하지 못했어요. 잠시 후 다시 시도해 주세요.'
			});
		}
	}

	/**
	 * 재생 계열(search/play) 공통 검증 — 멤버·권한·음성 접속·채널 충돌.
	 * 성공 시 재생에 필요한 식별자와 요청자 표시를 돌려줘요.
	 */
	private async verifyPlaybackRequest(
		guild: Guild,
		userId: string
	): Promise<{ error: string } | { voiceChannelId: string; textChannelId: string | null; requester: { id: string; username: string } }> {
		const member = await this.fetchMember(guild, userId);
		if (!member) return { error: '서버에서 회원님을 찾을 수 없어요.' };

		if (!(await this.hasControlPermission(guild.id, member))) {
			return { error: `${emoji('error')} 재생 제어는 서버 관리자 또는 DJ 역할이 필요해요.` };
		}

		const voiceChannelId = member.voice?.channelId ?? null;
		if (!voiceChannelId) return { error: `${emoji('bulb')} ${VOICE_CHANNEL_REQUIRED_MESSAGE}` };

		const player = container.audio.getPlayer(guild.id);
		if (player?.voiceChannelId && player.voiceChannelId !== voiceChannelId) {
			return {
				error: `${emoji('headphone')} 다른 음성 채널(<#${player.voiceChannelId}>)에서 재생 중이에요. 같은 채널에 접속하거나 정지한 뒤 시도해 주세요.`
			};
		}

		// 텍스트 채널 정책: 고정 채널 우선, 없으면 시스템 채널 (컨트롤러/피드백 메시지 대상)
		const pinned = await container.guildService.getPinnedChannel(guild.id);
		return {
			voiceChannelId,
			textChannelId: pinned ?? guild.systemChannelId ?? null,
			requester: { id: userId, username: member.displayName }
		};
	}

	private async fetchMember(guild: Guild | null, userId: string): Promise<GuildMember | null> {
		if (!guild) return null;
		const cached = guild.members.cache.get(userId);
		if (cached) return cached;
		return guild.members.fetch(userId).catch(() => null);
	}

	/** 재생 제어 권한 — Manage Guild/Administrator 또는 DJ 역할 (봇 캐시가 유일한 판정 근거예요) */
	private async hasControlPermission(guildId: string, member: GuildMember): Promise<boolean> {
		const { has } = member.permissions;
		if (has(PermissionsBitField.Flags.ManageGuild) || has(PermissionsBitField.Flags.Administrator)) return true;
		return container.guildService.hasDJRole(guildId, member);
	}

	/** 재생 피드백 컨테이너 — commandChannel buildFeedback과 동일한 분기(시작/추가)예요 */
	private async buildFeedback(player: Player, track: Track | UnresolvedTrack, userId: string, wasIdle: boolean) {
		if (wasIdle && (await container.audioService.isControllerEnabled(player.guildId))) {
			return [playView.playStarted({ track: track as Track, userId })];
		}
		return [playView.trackAdded(playView.trackAddedProps(player, track as Track))];
	}

	/** 고정 채널(또는 시스템 채널)에 재생 피드백을 보내요 — Discord 참여자가 웹에서의 재생을 볼 수 있게 해요 */
	private async sendFeedbackMessage(guildId: string, textChannelId: string | null | undefined, components: ContainerBuilder[]): Promise<void> {
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
			.catch((error) => this.logger.warn(`웹 플레이어 피드백 전송 실패 (guild ${guildId}): ${error}`));
	}

	/** 쿨다운 맵이 커지는 것을 막는다 — commandChannel pruneCooldowns과 같은 규칙 */
	private pruneCooldowns(): void {
		if (this.cooldowns.size < 1000) return;
		for (const [key, timestamp] of this.cooldowns) {
			if (Date.now() - timestamp > 10_000) this.cooldowns.delete(key);
		}
	}

	/** 요청한 kind에 맞는 응답을 RESPONSE 채널로 퍼블리시해요 (redisStore 없으면 로그만 남겨요) */
	private respond(response: PlayerWebResponse): void {
		const store = container.redisStore;
		if (!store) {
			this.logger.warn(`웹 플레이어 응답을 위한 redisStore가 없어요 (guild ${response.guildId}, kind ${response.kind})`);
			return;
		}
		store.publishPlayerWebResponse(JSON.stringify(response));
	}
}
