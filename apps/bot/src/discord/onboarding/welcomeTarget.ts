/**
 * 서버 가입 안내를 보낼 곳 고르기 (D-3b) — 순수 함수라 discord.js 없이 테스트해요.
 * 순서: 시스템 채널 → 커뮤니티 공지 채널 → 봇이 쓸 수 있는 첫 텍스트 채널 → 서버 주인 DM.
 * 디스코드에는 "기본 채널" 필드가 없어요 (2017년에 없어졌어요).
 */

export type WelcomeChannelKind = 'system' | 'publicUpdates' | 'text';

export interface WelcomeChannelCandidate {
	id: string;
	kind: WelcomeChannelKind;
	/** 봇이 이 채널을 보고(ViewChannel) 메시지를 보낼(SendMessages) 수 있는지 */
	canSend: boolean;
}

export type WelcomeTarget = { type: 'channel'; channelId: string; kind: WelcomeChannelKind } | { type: 'ownerDm' };

const KIND_ORDER: readonly WelcomeChannelKind[] = ['system', 'publicUpdates', 'text'];

/** 후보는 종류별로 넘기고, 텍스트 채널은 화면 순서대로 넘겨요. 쓸 수 있는 채널이 없으면 주인 DM이에요. */
export function pickWelcomeTarget(candidates: readonly WelcomeChannelCandidate[]): WelcomeTarget {
	for (const kind of KIND_ORDER) {
		const found = candidates.find((c) => c.kind === kind && c.canSend);
		if (found) return { type: 'channel', channelId: found.id, kind };
	}
	return { type: 'ownerDm' };
}
