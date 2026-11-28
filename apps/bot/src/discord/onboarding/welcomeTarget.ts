export type WelcomeChannelKind = 'system' | 'publicUpdates' | 'text';

export interface WelcomeChannelCandidate {
	id: string;
	kind: WelcomeChannelKind;
	canSend: boolean;
}

export type WelcomeTarget = { type: 'channel'; channelId: string; kind: WelcomeChannelKind } | { type: 'ownerDm' };

const KIND_ORDER: readonly WelcomeChannelKind[] = ['system', 'publicUpdates', 'text'];

export function pickWelcomeTarget(candidates: readonly WelcomeChannelCandidate[]): WelcomeTarget {
	for (const kind of KIND_ORDER) {
		const found = candidates.find((c) => c.kind === kind && c.canSend);
		if (found) return { type: 'channel', channelId: found.id, kind };
	}
	return { type: 'ownerDm' };
}
