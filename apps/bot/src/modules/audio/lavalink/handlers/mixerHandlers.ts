import { randomUUID } from 'node:crypto';
import { container } from '@sapphire/framework';
import { Track, TrackEndEvent } from 'lavalink-client';
import { CustomPlayer, OverrideAction } from '../player/customPlayer.ts';
import { getTargetNextTrack, notifyQueueMutated } from '../queue/queueWrapper.ts';
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
	const settings = await container.guildService.getMixerSettings(player.guildId).catch(() => null);
	const gapless = settings?.gaplessEnabled ?? true;
	const crossfade = settings?.crossfadeEnabled ?? false;

	// If both gapless and crossfade are disabled, do not arm the next track on the server.
	// Tell the plugin NO_NEXT (isEmpty: true) so it emits TrackEndEvent and leaves Cold Start to the bot.
	if (!gapless && !crossfade) {
		try {
			await container.mixerService.arm(
				player,
				{
					epoch: player.currentEpoch,
					encodedTrack: null,
					isEmpty: true
				},
				randomUUID()
			);
		} catch (error) {
			container.logger.debug(`[mixer] arm NO_NEXT (gapless/crossfade off) failed on guild ${player.guildId}: ${String(error)}`);
		}
		return;
	}

	const target = getTargetNextTrack(player);
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

		try {
			const latestTarget = getTargetNextTrack(player);
			await container.mixerService.arm(
				player,
				{
					epoch: player.currentEpoch,
					encodedTrack: latestTarget?.encoded ?? null,
					isEmpty: !latestTarget
				},
				randomUUID()
			);
		} catch (retryError) {
			container.logger.error(`[mixer] arm retry failed on guild ${player.guildId}: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
		}
	}
}

/* ------------------------------------------------------------------ */
/* 2. MixerAdvancedEvent Handler                                      */
/* ------------------------------------------------------------------ */
export async function handleMixerAdvanced(player: CustomPlayer, event: MixerAdvancedEventPayload): Promise<void> {
	const head = player.queue.tracks[0];

	// (1) Stale: Bot epoch has already moved ahead
	if (event.epoch !== player.currentEpoch) {
		if (player.queue.current?.encoded === event.encodedTrack) {
			return;
		}
		container.logger.warn(`[mixer] stale advanced event (got ${event.epoch}, current ${player.currentEpoch}) on guild ${player.guildId}`);
		await recover(player, 'stale');
		return;
	}

	// (2) Desync: Epoch matches but encoded track does not match head
	if (!head || head.encoded !== event.encodedTrack) {
		container.logger.error(`[mixer] desync assert failed: plugin=${event.encodedTrack}, head=${head?.encoded} on guild ${player.guildId}`);
		await recover(player, 'desync');
		return;
	}

	// (3) Normal Commit: Advance 1 track without firing invalidate
	rt(player).transitionSeq++;
	commitLocal(player, head as Track, { invalidate: false });
}

async function recover(player: CustomPlayer, reason: 'stale' | 'desync'): Promise<void> {
	if (isOverrideInFlight(player)) {
		return;
	}
	const head = player.queue.tracks[0] as Track | undefined;
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

/* ------------------------------------------------------------------ */
/* 3. TrackEndEvent Handler                                           */
/* ------------------------------------------------------------------ */
export async function handleMixerTrackEnd(player: CustomPlayer, event: TrackEndEvent): Promise<void> {
	if (event.reason !== 'finished' && event.reason !== 'loadFailed') return;

	const ended = event.track?.encoded ?? null;
	if (!ended || ended !== player.queue.current?.encoded) {
		return;
	}

	if (isOverrideInFlight(player)) {
		return;
	}

	if (TRACK_END_CONFIRM_MS > 0) {
		const seq = rt(player).transitionSeq;
		await sleep(TRACK_END_CONFIRM_MS);
		if (seq !== rt(player).transitionSeq || player.queue.current?.encoded !== ended) {
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
		try {
			await execute(player.currentEpoch);
		} catch (error: unknown) {
			if (error instanceof MixerRequestError && error.status === 409 && typeof error.lastKnownEpoch === 'number') {
				player.currentEpoch = Math.max(player.currentEpoch, error.lastKnownEpoch);
			}
			if (error instanceof MixerRequestError && typeof error.v2WindowOpenAt === 'number') {
				const remaining = error.v2WindowOpenAt - Date.now() + 50;
				if (remaining > 0) await sleep(remaining);
			}
			await execute(player.currentEpoch);
		}
		return 'sent';
	} catch (fatalError: unknown) {
		clearTimeout(timer);
		state.pending.delete(idemKey);
		container.logger.error(`[mixer] override failed twice on guild ${player.guildId}: ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`);
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

		const current = player.queue.current;
		await container.mixerService.override(
			player,
			{
				epoch: player.currentEpoch,
				action: current ? 'PLAY_NOW' : 'STOP',
				encodedTrack: current?.encoded
			},
			randomUUID()
		);
	} catch (resyncError: unknown) {
		container.logger.error(`[mixer] hard resync failed on guild ${player.guildId}: ${resyncError instanceof Error ? resyncError.message : String(resyncError)}`);
	}
}

function scheduleRecoveryProbe(player: CustomPlayer): void {
	setTimeout(async () => {
		if (isOverrideInFlight(player)) return;

		for (let i = 0; i < 3; i++) {
			const serverPlayer = (await player.node?.fetchPlayer(String(player.guildId)).catch(() => null)) as { track?: { encoded?: string } } | null;
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
