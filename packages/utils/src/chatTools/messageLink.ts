const MESSAGE_LINK_MAX = 3;

export interface MessageLinkTarget {
	guildId: string;
	channelId: string;
	messageId: string;
}

// Negative lookbehind avoids matching inside domains like thetwitter.com.
const MESSAGE_LINK_PATTERN =
	/(?<![\w.-])(?:https?:\/\/)?(?:ptb\.|canary\.)?(?:www\.)?discord\.com\/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/gu;

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
