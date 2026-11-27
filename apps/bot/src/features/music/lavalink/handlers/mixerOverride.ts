import { randomUUID } from 'node:crypto';
import { sleep } from '@sirubot/utils/time';
import { CustomPlayer, OverrideAction } from '../player/customPlayer.ts';
import type { LavalinkDeps } from '../deps.ts';
import { cancelPendingInvalidate, getTargetNextTrack, getTrackUid } from '../queue/queueWrapper.ts';
import { isSameTrack, normalizeTrackEncoded } from './playbackWatchdog.ts';
import { MixerRequestError } from '../mixerProtocol.ts';

// Override side of the mixer protocol: sending PLAY_NOW/STOP overrides, matching their acknowledgements,
// and falling back to a hard resync when the plugin and the client disagree.

const OVERRIDDEN_TIMEOUT_MS = 5_000;
const PROBE_DELAY_MS = 3_000;

const rt = (p: CustomPlayer) => p.mixerRuntime;
export const isOverrideInFlight = (p: CustomPlayer) => (p.mixerRuntime?.pending?.size ?? 0) > 0;

export function clearMixerRuntime(player: CustomPlayer): void {
	cancelPendingInvalidate(player);
	if (!player.mixerRuntime?.pending) return;
	for (const pending of player.mixerRuntime.pending.values()) {
		clearTimeout(pending.timer);
	}
	player.mixerRuntime.pending.clear();
}

export interface MixerOverriddenEventPayload {
	epoch: number;
	requestId: string;
	action: OverrideAction;
}

export function handleMixerOverridden(deps: LavalinkDeps, player: CustomPlayer, event: MixerOverriddenEventPayload): void {
	const pending = rt(player).pending.get(event.requestId);
	if (!pending) {
		deps.logger.debug(`[mixer] overridden received without pending record: req=${event.requestId} on guild ${player.guildId}`);
		return;
	}

	clearTimeout(pending.timer);
	rt(player).pending.delete(event.requestId);

	if (pending.recovery) {
		scheduleRecoveryProbe(deps, player);
	}
}

export async function sendOverride(
	deps: LavalinkDeps,
	player: CustomPlayer,
	action: OverrideAction,
	encodedTrack: string | null,
	opts: { recovery?: boolean } = {}
): Promise<'sent' | 'deduped' | 'resynced'> {
	const state = rt(player);
	if (!state) return 'sent';
	const canonicalEncoded = encodedTrack ? normalizeTrackEncoded(encodedTrack) : null;
	const intentKey = `${player.currentEpoch}:${action}:${canonicalEncoded ?? ''}`;
	for (const p of state.pending.values()) {
		if (p.intentKey === intentKey) {
			return 'deduped';
		}
	}

	let activeIdemKey = randomUUID();
	const timer = setTimeout(() => onOverriddenTimeout(deps, player, activeIdemKey), OVERRIDDEN_TIMEOUT_MS);
	state.pending.set(activeIdemKey, {
		epoch: player.currentEpoch,
		action,
		intentKey,
		recovery: !!opts.recovery,
		timer
	});
	state.transitionSeq++;

	const execute = (epoch: number, key: string) =>
		deps.mixerService.override(
			player,
			{
				epoch,
				action,
				encodedTrack: canonicalEncoded
			},
			key
		);

	try {
		let res: unknown;
		try {
			res = await execute(player.currentEpoch, activeIdemKey);
		} catch (error: unknown) {
			if (!(error instanceof MixerRequestError) || error.status !== 409) {
				throw error;
			}
			const prevEpoch = player.currentEpoch;
			if (typeof error.lastKnownEpoch === 'number') {
				player.currentEpoch = Math.max(player.currentEpoch, error.lastKnownEpoch);
			}
			if (typeof error.v2WindowOpenAt === 'number') {
				const remaining = error.v2WindowOpenAt - Date.now() + 50;
				if (remaining > 0) await sleep(remaining);
			}
			if (player.currentEpoch !== prevEpoch) {
				const oldRecord = state.pending.get(activeIdemKey);
				state.pending.delete(activeIdemKey);
				activeIdemKey = randomUUID();
				if (oldRecord) {
					state.pending.set(activeIdemKey, {
						...oldRecord,
						epoch: player.currentEpoch
					});
				}
			}
			res = await execute(player.currentEpoch, activeIdemKey);
		}
		// Idempotent duplicates do not emit a second MixerOverriddenEvent, so clean up now.
		if (res && typeof res === 'object' && 'duplicate' in res && res.duplicate === true) {
			const rec = state.pending.get(activeIdemKey);
			if (rec) {
				clearTimeout(rec.timer);
				state.pending.delete(activeIdemKey);
				if (rec.recovery) {
					scheduleRecoveryProbe(deps, player);
				}
			}
		}
		return 'sent';
	} catch (fatalError: unknown) {
		clearTimeout(timer);
		state.pending.delete(activeIdemKey);
		deps.logger.error(
			`[mixer] override failed twice on guild ${player.guildId}: ${fatalError instanceof Error ? fatalError.message : String(fatalError)}`
		);
		await hardResync(deps, player);
		return 'resynced';
	}
}

function onOverriddenTimeout(deps: LavalinkDeps, player: CustomPlayer, idemKey: string): void {
	if (!rt(player).pending.delete(idemKey)) return;
	deps.logger.warn(`[mixer] overridden timeout for req=${idemKey} on guild ${player.guildId}`);
	scheduleRecoveryProbe(deps, player);
}

export async function hardResync(deps: LavalinkDeps, player: CustomPlayer): Promise<void> {
	try {
		clearMixerRuntime(player);
		const state = await deps.mixerService.getState(player).catch(() => null);
		player.currentEpoch = Math.max(player.currentEpoch, state?.lastKnownEpoch ?? 0) + 100;
		await deps.mixerService.reset(player, player.currentEpoch, randomUUID());

		// Wait past plugin's windowOpenGraceMs (1500ms) to avoid 409 PRE_RESET_ARRIVAL.
		await sleep(1600);

		const freshEpoch = await deps.mixerService
			.getState(player)
			.then((s) => s.lastKnownEpoch)
			.catch(() => null);
		if (typeof freshEpoch === 'number') {
			player.currentEpoch = Math.max(player.currentEpoch, freshEpoch + 1);
		}
		const current = player.queue.current;
		const action: OverrideAction = current ? 'PLAY_NOW' : 'STOP';
		const encodedTrack = current?.encoded ? normalizeTrackEncoded(current.encoded) : null;
		const resyncKey = randomUUID();
		try {
			await deps.mixerService.override(player, { epoch: player.currentEpoch, action, encodedTrack }, resyncKey);
		} catch (err: unknown) {
			if (err instanceof MixerRequestError && err.status === 409) {
				if (typeof err.lastKnownEpoch === 'number') {
					player.currentEpoch = Math.max(player.currentEpoch, err.lastKnownEpoch);
				}
				if (typeof err.v2WindowOpenAt === 'number') {
					const waitMs = err.v2WindowOpenAt - Date.now() + 50;
					if (waitMs > 0) await sleep(waitMs);
				}
				await deps.mixerService.override(player, { epoch: player.currentEpoch, action, encodedTrack }, randomUUID());
			} else {
				throw err;
			}
		}
		player.mixerRuntime.lastTargetUid = getTrackUid(getTargetNextTrack(player));
	} catch (resyncError: unknown) {
		deps.logger.error(
			`[mixer] hard resync failed on guild ${player.guildId}: ${resyncError instanceof Error ? resyncError.message : String(resyncError)}`
		);
	}
}

function scheduleRecoveryProbe(deps: LavalinkDeps, player: CustomPlayer): void {
	setTimeout(async () => {
		if (isOverrideInFlight(player)) return;

		for (let i = 0; i < 3; i++) {
			const serverPlayer = (await player.node?.fetchPlayer(String(player.guildId)).catch(() => null)) as {
				track?: { encoded?: string; info?: { identifier?: string } };
			} | null;
			const serverTrack = serverPlayer?.track ?? null;
			const clientTrack = player.queue.current ?? null;

			if ((!serverTrack && !clientTrack) || isSameTrack(serverTrack, clientTrack)) return;
			if (i < 2) await sleep(300);
		}
		deps.logger.error(`[mixer] post-recovery desync detected on guild ${player.guildId}, forcing hardResync`);
		await hardResync(deps, player);
	}, PROBE_DELAY_MS);
}
