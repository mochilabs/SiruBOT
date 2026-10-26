import { randomUUID } from 'node:crypto';
import { container } from '@sapphire/framework';
import { Track, TrackEndEvent } from 'lavalink-client';
import { CustomPlayer, OverrideAction } from '../player/customPlayer.ts';
import { getTargetNextTrack, getTrackUid, notifyQueueMutated } from '../queue/queueWrapper.ts';
import { isTtsClip } from '../requester.ts';
import { isSameTrack } from './playbackWatchdog.ts';
import { MixerRequestError } from '../../../../services/mixerService.ts';

const OVERRIDDEN_TIMEOUT_MS = 5_000;
const TRACK_END_CONFIRM_MS = 200; // S1 confirmed B-plan (EventEmitter replaced reason dispatch)
const PROBE_DELAY_MS = 3_000;
const SAMPLE_PROBE_INTERVAL_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const rt = (p: CustomPlayer) => p.mixerRuntime;
export const isOverrideInFlight = (p: CustomPlayer) => p.mixerRuntime.pending.size > 0;

export interface MixerNeedNextEventPayload {
	remainingMs: number;
	currentTrackEncoded: string;
}

export interface MixerAdvancedEventPayload {
	epoch: number;
	encodedTrack: string;
	handoffType: string;
	handoffId?: string;
}

export interface MixerOverriddenEventPayload {
	epoch: number;
	requestId: string;
	action: OverrideAction;
}

/**
 * Common local commit function shared by normal advance, user skip, recovery, and rehydration.
 */
export function commitLocal(player: CustomPlayer, track: Track, opts: { invalidate?: boolean } = {}): void {
	if (player.repeatMode === 'track') {
		player.queue.current = track;
		notifyQueueMutated(player, opts);
		container.playerNotifier.updateController(player);
		return;
	}

	const [now] = player.queue.tracks.splice(0, 1);
	if (player.queue.current) {
		player.queue.previous.unshift(player.queue.current);
		while (player.queue.previous.length > 25) {
			player.queue.previous.pop();
		}
	}
	player.queue.current = (now as Track | undefined) ?? null;
	notifyQueueMutated(player, opts);
	container.playerNotifier.updateController(player);
}

/* ------------------------------------------------------------------ */
/* 1. MixerNeedNextTrackEvent Handler                                 */
/* ------------------------------------------------------------------ */
export async function handleMixerNeedNext(player: CustomPlayer, _event: MixerNeedNextEventPayload): Promise<void> {
	// 단독 TTS 클립 재생 중엔 DB 조회·REST 아밍을 하지 않는다 (명세 4.2) —
	// 클립은 1~4초마다 끝나므로 이벤트가 매번 오고, 음악 슬롯은 continueAfterTtsClip이 소유한다.
	if (isTtsClip(player.queue?.current)) return;

	// 이벤트가 이 곡의 전이를 묘사한다고 가정한다 — DB await·REST 왕복 사이에
	// 스킵/콜드스타트/오버라이드/트랙스타트가 끼어들면 stale로 판정해 아밍하지 않는다.
	const triggerEncoded = player.queue.current?.encoded ?? null;
	const settings = await container.guildService.getMixerSettings(player.guildId).catch(() => null);
	const gapless = settings?.gaplessEnabled ?? true;
	const crossfade = settings?.crossfadeEnabled ?? false;

	// gapless/crossfade가 모두 꺼져 있으면 NO_NEXT(isEmpty: true)로 아밍해 서버가 TrackEndEvent를
	// 내보낸 뒤 cold start를 봇에게 맡긴다. 아밍 경로 자체는 항상 같다 (409 재시도 공유).
	const shouldArm = gapless || crossfade;

	const stale = () =>
		isTtsClip(player.queue.current) ||
		!player.playing ||
		rt(player).pending.size > 0 ||
		(player.queue.current?.encoded ?? null) !== triggerEncoded;

	if (stale()) return;

	const target = shouldArm ? getTargetNextTrack(player) : null;
	const key = randomUUID();

	try {
		await container.mixerService.arm(
			player,
			{
				epoch: player.currentEpoch,
				encodedTrack: target?.encoded ?? null,
				isEmpty: !target
			},
			key
		);
		// 아밍한 헤드를 기록해 notifyQueueMutated가 null==null blind spot으로
		// invalidate를 누락하는 일을 막는다 (F3).
		player.mixerRuntime.lastTargetUid = getTrackUid(target);
	} catch (error: unknown) {
		if (!(error instanceof MixerRequestError) || error.status !== 409) {
			container.logger.warn(`[mixer] arm failed on guild ${player.guildId}: ${error instanceof Error ? error.message : String(error)}`);
			return;
		}

		// 409 Conflict: bot epoch is behind plugin's lastKnownEpoch (e.g. invalidate arrived first)
		if (typeof error.lastKnownEpoch === 'number') {
			player.currentEpoch = Math.max(player.currentEpoch, error.lastKnownEpoch);
		}
		if (typeof error.v2WindowOpenAt === 'number') {
			const remainingWait = error.v2WindowOpenAt - Date.now() + 50;
			if (remainingWait > 0) await sleep(remainingWait);
		}

		// 재시도 전에도 전이가 이미 소유권을 넘겼는지 재확인한다 — 그렇지 않으면
		// 콜드스타트/스킵된 새 곡의 시작 시점에 다음 곡을 아밍해 슬롯을 핀한다 (F1).
		if (stale()) return;

		try {
			const latestTarget = shouldArm ? getTargetNextTrack(player) : null;
			await container.mixerService.arm(
				player,
				{
					epoch: player.currentEpoch,
					encodedTrack: latestTarget?.encoded ?? null,
					isEmpty: !latestTarget
				},
				randomUUID()
			);
			player.mixerRuntime.lastTargetUid = getTrackUid(latestTarget);
		} catch (retryError) {
			container.logger.error(
				`[mixer] arm retry failed on guild ${player.guildId}: ${retryError instanceof Error ? retryError.message : String(retryError)}`
			);
		}
	}
}

/* ------------------------------------------------------------------ */
/* 2. MixerAdvancedEvent Handler                                      */
/* ------------------------------------------------------------------ */
export async function handleMixerAdvanced(player: CustomPlayer, event: MixerAdvancedEventPayload): Promise<void> {
	const target = getTargetNextTrack(player);
	const confirmedEncoded = player.transitionState?.confirmedNowPlaying?.encoded ?? player.queue.current?.encoded ?? null;
	const alreadyCurrent = player.queue.current?.encoded === event.encodedTrack || confirmedEncoded === event.encodedTrack;

	// (1) Stale: Bot epoch has already moved ahead. If the advanced track is the
	// track the server is actually playing (confirmed/current), the epoch just
	// lagged behind a local mutation that hadn't invalidated yet — resync and
	// return without recovery. Reserve recovery for a real track mismatch.
	if (event.epoch !== player.currentEpoch) {
		if (alreadyCurrent) {
			player.currentEpoch = Math.max(player.currentEpoch, event.epoch);
			rt(player).transitionSeq++;
			player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
			return;
		}
		if (target && target.encoded === event.encodedTrack) {
			// 로컬 epoch가 앞서나갔지만 아직 invalidate가 서버에 도달하기 전에
			// 서버가 (변경 없는) 헤드로 정상 전이한 경우 — recover하지 말고
			// epoch만 재동기화하고 정상 commit한다 (S11).
			player.currentEpoch = Math.max(player.currentEpoch, event.epoch);
			rt(player).transitionSeq++;
			commitLocal(player, target as Track, { invalidate: false });
			return;
		}
		container.logger.warn(`[mixer] stale advanced event (got ${event.epoch}, current ${player.currentEpoch}) on guild ${player.guildId}`);
		await recover(player, 'stale', event.encodedTrack);
		return;
	}

	// (2) Epoch matches: if TrackStartEvent arrived slightly before MixerAdvancedEvent,
	// syncQueueToNowPlaying already shifted the track into queue.current (and target is
	// now the FOLLOWING track). Treat that as already-committed rather than a false desync.
	if ((!target || target.encoded !== event.encodedTrack) && alreadyCurrent && player.repeatMode !== 'track') {
		rt(player).transitionSeq++;
		player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
		return;
	}

	// (3) Desync: Epoch matches but encoded track does not match target head
	if (!target || target.encoded !== event.encodedTrack) {
		container.logger.error(`[mixer] desync assert failed: plugin=${event.encodedTrack}, target=${target?.encoded} on guild ${player.guildId}`);
		await recover(player, 'desync', event.encodedTrack);
		return;
	}

	// (4) Normal Commit: Advance 1 track without firing invalidate
	rt(player).transitionSeq++;
	commitLocal(player, target as Track, { invalidate: false });
}

async function recover(player: CustomPlayer, reason: 'stale' | 'desync', serverEncoded?: string): Promise<void> {
	if (isOverrideInFlight(player)) {
		// A pending override owns the slot right now. Do not drop the recovery:
		// retry once the override settles so a silent guild doesn't stall forever.
		setTimeout(() => {
			if (!isOverrideInFlight(player)) void recover(player, reason, serverEncoded);
		}, OVERRIDDEN_TIMEOUT_MS);
		return;
	}

	// 서버가 이미 해당 트랙을 재생 중이면 bookkeeping만 하고 재시작(오버라이드)하지
	// 않는다 — 재시작하면 들리는 오디오가 0초로 되감겨 S10의 이중 재생이 된다.
	const head = player.queue.tracks[0] as Track | undefined;
	if (serverEncoded) {
		const serverTrack = await fetchServerTrackById(player);
		if (serverTrack && isSameTrack(serverTrack, { encoded: serverEncoded })) {
			commitLocalIfMatches(player, serverEncoded);
			container.logger.info(`[mixer] recovery (${reason}) reconciled to server track on guild ${player.guildId}`);
			return;
		}
	}

	if (head) {
		commitLocal(player, head, { invalidate: false });
		await sendOverride(player, 'PLAY_NOW', head.encoded ?? null, { recovery: true });
	} else {
		player.queue.current = null;
		container.playerNotifier.updateController(player);
		await sendOverride(player, 'STOP', null, { recovery: true });
	}
	container.logger.info(`[mixer] recovery (${reason}) executed on guild ${player.guildId}`);
}

/** REST 프로브로 서버 재생 트랙을 조회한다 (실패 시 null). */
async function fetchServerTrackById(player: CustomPlayer): Promise<{ encoded?: string; info?: { identifier?: string } } | null> {
	try {
		const serverPlayer = (await player.node.fetchPlayer(String(player.guildId))) as {
			track?: { encoded?: string; info?: { identifier?: string } };
		} | null;
		if (!serverPlayer || 'status' in serverPlayer || !serverPlayer.track) return null;
		return serverPlayer.track;
	} catch {
		return null;
	}
}

/** 서버가 이미 재생 중인 트랙이면 큐 선두가 그 트랙일 때만 commit한다 (그 외엔 손대지 않는다). */
function commitLocalIfMatches(player: CustomPlayer, serverEncoded: string): void {
	const head = player.queue.tracks[0] as Track | undefined;
	if (head && head.encoded === serverEncoded) {
		rt(player).transitionSeq++;
		commitLocal(player, head, { invalidate: false });
	}
}

/* ------------------------------------------------------------------ */
/* 3. TrackEndEvent Handler                                           */
/* ------------------------------------------------------------------ */
export async function handleMixerTrackEnd(player: CustomPlayer, event: TrackEndEvent): Promise<void> {
	if (event.reason !== 'finished' && event.reason !== 'loadFailed') return;

	const ended = event.track?.encoded ?? null;
	// lavalink-client가 queueEnd 경로에서 queue.current를 먼저 비울 수 있다 —
	// 시작 확정값(confirmedNowPlaying/lastStartedEncoded)을 폴백으로 삼아 현재 곡을 판별한다.
	const currentOrConfirmed =
		player.queue.current?.encoded ?? player.transitionState?.confirmedNowPlaying?.encoded ?? player.transitionState?.lastStartedEncoded ?? null;
	if (!ended || ended !== currentOrConfirmed) {
		return;
	}

	if (isOverrideInFlight(player)) {
		return;
	}

	if (TRACK_END_CONFIRM_MS > 0) {
		const seq = rt(player).transitionSeq;
		await sleep(TRACK_END_CONFIRM_MS);
		// 대기 동안 current가 비었는지 여부만으로 판단하지 않는다 — 확인값이 살아 있으면
		// ended와 같을 때만 진행해 queueEnd 시프트와 뒤늦은 다른 트랙 시작을 거른다.
		const afterCurrent =
			player.queue.current?.encoded ??
			player.transitionState?.confirmedNowPlaying?.encoded ??
			player.transitionState?.lastStartedEncoded ??
			null;
		if (seq !== rt(player).transitionSeq || (afterCurrent !== null && afterCurrent !== ended)) {
			return;
		}
	}

	await coldStart(player, ended);
}

async function coldStart(player: CustomPlayer, ended: string): Promise<void> {
	if (player.repeatMode === 'track') {
		await sendOverride(player, 'PLAY_NOW', ended);
		return;
	}

	const next = getTargetNextTrack(player);
	if (!next) {
		player.queue.current = null;
		container.playerNotifier.updateController(player);
		return;
	}

	// 플러그인이 이미 갭리스/크로스페이드로 이 곡을 시작했는데 trackStart가
	// 200ms 확인창보다 늦게 도착하면 PLAY_NOW가 방금 시작된 곡을 0초로 되감는다.
	// 서버 프로브로 이미 재생 중이면 bookkeeping만 하고 오버라이드는 생략한다 (F4).
	const seqBeforeProbe = rt(player).transitionSeq;
	const serverTrack = await fetchServerTrackById(player);
	if (seqBeforeProbe !== rt(player).transitionSeq || isOverrideInFlight(player)) {
		// 프로브 대기 동안 MixerAdvancedEvent나 사용자 스킵이 이미 전이를 끝냈다.
		return;
	}
	if (next.encoded !== ended && serverTrack && isSameTrack(serverTrack, next)) {
		if (player.queue.current?.encoded !== next.encoded) {
			commitLocal(player, next, { invalidate: false });
		}
		return;
	}

	commitLocal(player, next, { invalidate: false });
	await sendOverride(player, 'PLAY_NOW', next.encoded ?? null);
}

/* ------------------------------------------------------------------ */
/* 4. MixerOverriddenEvent Handler                                    */
/* ------------------------------------------------------------------ */
export function handleMixerOverridden(player: CustomPlayer, event: MixerOverriddenEventPayload): void {
	const pending = rt(player).pending.get(event.requestId);
	if (!pending) {
		container.logger.debug(`[mixer] overridden received without pending record: req=${event.requestId} on guild ${player.guildId}`);
		return;
	}

	clearTimeout(pending.timer);
	rt(player).pending.delete(event.requestId);

	if (pending.recovery) {
		scheduleRecoveryProbe(player);
	}
}

/* ------------------------------------------------------------------ */
/* 5. sendOverride Command & Recovery Dispatcher                      */
/* ------------------------------------------------------------------ */
export async function sendOverride(
	player: CustomPlayer,
	action: OverrideAction,
	encodedTrack: string | null,
	opts: { recovery?: boolean } = {}
): Promise<'sent' | 'deduped' | 'resynced'> {
	const state = rt(player);
	const intentKey = `${player.currentEpoch}:${action}:${encodedTrack ?? ''}`;

	for (const p of state.pending.values()) {
		if (p.intentKey === intentKey) {
			return 'deduped';
		}
	}

	const idemKey = randomUUID();
	const timer = setTimeout(() => onOverriddenTimeout(player, idemKey), OVERRIDDEN_TIMEOUT_MS);
	state.pending.set(idemKey, {
		epoch: player.currentEpoch,
		action,
		intentKey,
		recovery: !!opts.recovery,
		timer
	});
	state.transitionSeq++;

	const execute = (epoch: number) =>
		container.mixerService.override(
			player,
			{
				epoch,
				action,
				encodedTrack
			},
			idemKey
		);

	try {
		let res: unknown;
		try {
			res = await execute(player.currentEpoch);
		} catch (error: unknown) {
			if (error instanceof MixerRequestError && error.status === 409 && typeof error.lastKnownEpoch === 'number') {
				player.currentEpoch = Math.max(player.currentEpoch, error.lastKnownEpoch);
			}
			if (error instanceof MixerRequestError && typeof error.v2WindowOpenAt === 'number') {
				const remaining = error.v2WindowOpenAt - Date.now() + 50;
				if (remaining > 0) await sleep(remaining);
			}
			res = await execute(player.currentEpoch);
		}
		// 멱등성 게이트가 duplicate:true로 응답한 경우 플러그인은 두 번째
		// MixerOverriddenEvent를 보내지 않으므로 여기서 즉시 정리한다 (F6).
		// 일반 성공은 MixerOverriddenEvent가 도착할 때 handleMixerOverridden이
		// 정리하고 recovery probe를 예약한다.
		if ((res as { duplicate?: boolean } | null)?.duplicate === true) {
			const rec = state.pending.get(idemKey);
			if (rec) {
				clearTimeout(rec.timer);
				state.pending.delete(idemKey);
				if (rec.recovery) {
					scheduleRecoveryProbe(player);
				}
			}
		}
		return 'sent';
	} catch (fatalError: unknown) {
		clearTimeout(timer);
		state.pending.delete(idemKey);
		container.logger.error(
			`[mixer] override failed twice on guild ${player.guildId}: ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`
		);
		await hardResync(player);
		return 'resynced';
	}
}

function onOverriddenTimeout(player: CustomPlayer, idemKey: string): void {
	if (!rt(player).pending.delete(idemKey)) return;
	container.logger.warn(`[mixer] overridden timeout for req=${idemKey} on guild ${player.guildId}`);
	scheduleRecoveryProbe(player);
}

export async function hardResync(player: CustomPlayer): Promise<void> {
	try {
		const state = await container.mixerService.getState(player).catch(() => null);
		player.currentEpoch = Math.max(player.currentEpoch, state?.lastKnownEpoch ?? 0) + 100;
		await container.mixerService.reset(player, player.currentEpoch, randomUUID());

		// Wait past plugin's windowOpenGraceMs (default 1500ms) so the follow-up override isn't rejected with 409 PRE_RESET_ARRIVAL
		await sleep(1600);

		// 재-결정 시점의 epoch와 큐를 다시 읽는다 — sleep 사이에 notifyQueueMutated가
		// epoch를 또 올리거나 current가 바뀌었을 수 있다 (F7). sendOverride를 재호출하면
		// 실패 시 hardResync 재귀가 발생할 수 있으므로 직접 override를 호출하고 409만 1회 재시도한다.
		const freshEpoch = await container.mixerService.getState(player).then((s) => s.lastKnownEpoch).catch(() => null);
		if (typeof freshEpoch === 'number') {
			player.currentEpoch = Math.max(player.currentEpoch, freshEpoch + 1);
		}
		const current = player.queue.current;
		const action: OverrideAction = current ? 'PLAY_NOW' : 'STOP';
		const encodedTrack = current?.encoded ?? null;
		const resyncKey = randomUUID();
		try {
			await container.mixerService.override(
				player,
				{ epoch: player.currentEpoch, action, encodedTrack },
				resyncKey
			);
		} catch (err: unknown) {
			if (err instanceof MixerRequestError && err.status === 409 && typeof err.lastKnownEpoch === 'number') {
				player.currentEpoch = Math.max(player.currentEpoch, err.lastKnownEpoch);
				await container.mixerService.override(
					player,
					{ epoch: player.currentEpoch, action, encodedTrack },
					randomUUID()
				);
			} else {
				throw err;
			}
		}
		player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
	} catch (resyncError: unknown) {
		container.logger.error(
			`[mixer] hard resync failed on guild ${player.guildId}: ${resyncError instanceof Error ? resyncError.message : String(resyncError)}`
		);
	}
}

function scheduleRecoveryProbe(player: CustomPlayer): void {
	setTimeout(async () => {
		if (isOverrideInFlight(player)) return;

		for (let i = 0; i < 3; i++) {
			const serverPlayer = (await player.node?.fetchPlayer(String(player.guildId)).catch(() => null)) as {
				track?: { encoded?: string };
			} | null;
			const serverTrack = serverPlayer?.track?.encoded ?? null;
			const clientTrack = player.queue.current?.encoded ?? null;

			if (serverTrack === clientTrack) return;
			if (i < 2) await sleep(300);
		}
		container.logger.error(`[mixer] post-recovery desync detected on guild ${player.guildId}, forcing hardResync`);
		await hardResync(player);
	}, PROBE_DELAY_MS);
}

/**
 * Background sampling probe for 1% of active guilds to detect silent desyncs.
 */
export function startSamplingProbe(allGuildIds: string[]): NodeJS.Timeout {
	return setInterval(async () => {
		const count = Math.max(Math.ceil(allGuildIds.length * 0.01), 5);
		const sample = allGuildIds.slice(0, count);

		for (const gid of sample) {
			const player = container.audio.getPlayer(gid) as CustomPlayer | null;
			if (!player || !player.playing) continue;
			const serverPlayer = (await player.node?.fetchPlayer(String(gid)).catch(() => null)) as { track?: { encoded?: string } } | null;
			const ok = (serverPlayer?.track?.encoded ?? null) === (player.queue.current?.encoded ?? null);
			player.mixerRuntime.sampleMiss = ok ? 0 : player.mixerRuntime.sampleMiss + 1;
			if (player.mixerRuntime.sampleMiss >= 2) {
				container.logger.warn(`[mixer] sampling desync probe warning on guild ${gid}`);
				player.mixerRuntime.sampleMiss = 0;
			}
		}
	}, SAMPLE_PROBE_INTERVAL_MS);
}
