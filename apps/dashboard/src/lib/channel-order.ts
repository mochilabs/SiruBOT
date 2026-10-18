import { ChannelTypeValue, type DiscordChannelSummary } from "@/types/discord";

const TEXT_CHANNEL_TYPES = new Set<number>([ChannelTypeValue.GuildText, ChannelTypeValue.GuildAnnouncement]);

/**
 * Discord 채널 목록 순서를 재현해요.
 *
 * discord.js의 `channel.position`은 **같은 부모 + 같은 정렬 그룹(텍스트/음성/카테고리)** 안에서만
 * 의미가 있는 인덱스예요. 그래서 이 값을 길드 전체 기준으로 정렬하면 `position: 0` 채널들이 먼저 뭉치고
 * 카테고리가 서로 섞여요. 실제 Discord 사이드바 순서는 아래와 같아요:
 *
 *   1. 카테고리에 속하지 않은 채널 (텍스트 → 음성)
 *   2. 카테고리 머리글 → 그 안의 텍스트 채널 → 그 안의 음성 채널 (카테고리 position 순)
 *
 * 이 모듈이 그 순서의 유일한 결정처예요 — API 라우트와 선택지 빌더가 함께 써요.
 */
export function sortChannelsForDisplay<T extends DiscordChannelSummary>(channels: readonly T[]): T[] {
	const categoryRanks = new Map<string, number>();
	for (const channel of channels) {
		if (channel.type === ChannelTypeValue.GuildCategory) categoryRanks.set(channel.id, channel.position);
	}

	const key = (channel: T): [number, number, number, number] => {
		const isCategory = channel.type === ChannelTypeValue.GuildCategory;
		const parentRank = channel.parentId ? categoryRanks.get(channel.parentId) : undefined;
		// 카테고리가 목록에 없으면(지워졌거나 제외됨) 속한 채널을 맨 위 묶음으로 떨어뜨려요
		const bucket = isCategory ? 1 + channel.position : parentRank === undefined ? 0 : 1 + parentRank;
		// 같은 묶음 안에서는 머리글(카테고리)이 자식보다 먼저
		const headerRank = isCategory ? 0 : 1;
		const typeRank = isCategory ? 0 : TEXT_CHANNEL_TYPES.has(channel.type) ? 0 : 1;
		return [bucket, headerRank, typeRank, channel.position];
	};

	return [...channels].sort((a, b) => {
		const left = key(a);
		const right = key(b);
		for (let index = 0; index < left.length; index += 1) {
			if (left[index] !== right[index]) return left[index] - right[index];
		}
		// 순서가 완전히 겹치면 눈송이 ID로 결정 — 같은 값은 항상 같은 결과
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});
}
