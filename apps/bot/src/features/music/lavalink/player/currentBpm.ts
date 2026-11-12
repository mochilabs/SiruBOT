import type { MixerStateResponse } from '../mixerProtocol.ts';

export interface CurrentBpm {
	identifier: string;
	bpm: number;
}
type StateLoader = (signal: AbortSignal) => Promise<MixerStateResponse>;
type Entry = { node: object; identifier: string; bpm: CurrentBpm | null; nextPollAt: number; pending: boolean };

/** Rendering never waits for analysis REST. One short request per player at most every 5 seconds. */
export class CurrentBpmCache {
	private readonly entries = new WeakMap<object, Entry>();

	read(player: object, node: object, identifier: string | undefined, load: StateLoader, onChange?: () => void): CurrentBpm | null {
		if (!identifier) return null;
		let entry = this.entries.get(player);
		if (!entry) {
			entry = { node, identifier, bpm: null, nextPollAt: 0, pending: false };
			this.entries.set(player, entry);
		}
		if (entry.identifier !== identifier || entry.node !== node) {
			entry.identifier = identifier;
			entry.node = node;
			entry.bpm = null;
		}
		if (!entry.pending && Date.now() >= entry.nextPollAt) {
			entry.pending = true;
			entry.nextPollAt = Date.now() + 5000;
			const target = entry;
			const previousBpm = entry.bpm?.bpm;
			void Promise.resolve()
				.then(() => load(AbortSignal.timeout(750)))
				.then((state) => {
					if (target.identifier !== identifier || target.node !== node) return;
					target.bpm =
						state?.currentTrackBpmIdentifier === identifier &&
						typeof state.currentTrackBpm === 'number' &&
						Number.isFinite(state.currentTrackBpm) &&
						state.currentTrackBpm > 0
							? { identifier, bpm: state.currentTrackBpm }
							: null;
				})
				.catch(() => {
					if (target.identifier === identifier && target.node === node) target.bpm = null;
				})
				.finally(() => {
					target.pending = false;
					if (target.identifier === identifier && target.node === node && target.bpm?.bpm !== previousBpm) onChange?.();
				});
		}
		return entry.bpm;
	}
}
