/**
 * 메시지 링크 인용 계약 — discord.com/channels/길드/채널/메시지 링크를 자체 인용으로 보여줘요.
 *
 * 봇의 general/message 리스너가 이 모듈의 순수 함수로만 판정해요 (DB·Discord API 접근 없음).
 */

/** 한 메시지에서 인용할 최대 링크 수 */
export const MESSAGE_LINK_MAX = 3;

export interface MessageLinkTarget {
	guildId: string;
	channelId: string;
	messageId: string;
}

// (?<![\w.-]) — 앞이 글자·점·하이픈이면 매칭하지 않아요 (thetwitter.com 같은 유사 도메인 오탐 방지)
const MESSAGE_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:ptb\.|canary\.)?(?:www\.)?discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/gu;

/**
 * 메시지 본문에서 디스코드 메시지 링크를 뽑아요. `<링크>`로 감싼 링크는 임베드/링크 미리보기 자체를
 * 의도적으로 끈 것이므로 건너뛰어요. 중복 링크는 첫 번째만 인정해요.
 */
export function parseMessageLinks(content: string, limit: number = MESSAGE_LINK_MAX): MessageLinkTarget[] {
	const unmasked = content.replace(/<https?:\/\/[^>]+>/gu, ' ');
	const targets: MessageLinkTarget[] = [];
	const seen = new Set<string>();
	for (const match of unmasked.matchAll(MESSAGE_LINK_PATTERN)) {
		if (seen.has(match[3])) continue;
		seen.add(match[3]);
		targets.push({ guildId: match[1], channelId: match[2], messageId: match[3] });
		if (targets.length >= limit) break;
	}
	return targets;
}
