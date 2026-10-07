import { appEmoji, createContainer, formatTrack, formatTimeToKorean, formatTime } from '@sirubot/utils';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { Player, Track } from 'lavalink-client';
import { getUserQueuedTracks } from '../lavalink/autoPlayRelated.ts';

type QueueViewProps = {
	player: Player;
	page: number;
	totalPages: number;
	authorId: string;
	/** 셀렉트 메뉴에서 선택된 곡의 전역 인덱스(0-based). 해당 옵션을 default로 표시한다. */
	selectedIndex?: number | null;
};

const QUEUE_PAGE_SIZE = 10;

export const queueCustomIdPrefix = 'queue:page:';

/** 대기열 곡 선택 셀렉트 메뉴 — controllerSelectMenu 핸들러가 파싱한다. */
export const queueSelectCustomId = 'controller:queue:select';
/** 대기열 목록에서 쓰는 점프/삭제 버튼 — controllerButton 핸들러의 queue 서브커맨드와 같다. */
export const queueJumpCustomId = 'controller:queue:jumpTo';
export const queueRemoveCustomId = 'controller:queue:remove';

/** 문자열을 max_length 이하로 줄이고 넘치는 부분은 …로 대체한다. (undefined도 안전하게) */
function truncate(text: string | undefined, maxLength: number): string {
	const value = text ?? '';
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

export function queueList({ player, page, totalPages, authorId, selectedIndex = null }: QueueViewProps) {
	const containerComponent = createContainer();
	// 선예열한 추천곡은 대기열 목록에 세지 않는다 (재생에는 그대로 쓰인다).
	const tracks = getUserQueuedTracks(player);
	const start = (page - 1) * QUEUE_PAGE_SIZE;
	const pageTracks = tracks.slice(start, start + QUEUE_PAGE_SIZE);

	const lines = pageTracks.map((track, index) => {
		return `\`#${start + index + 1}\` ${formatTrack(track as Track, {
			showLength: true,
			withMarkdownURL: true,
			cleanTitle: true
		})}`;
	});

	// 카운트가 유저 대기열 곡만 세는 만큼, 남은 시간도 그 곡들만 센다 (재생 중인 곡 제외).
	const queuedDuration = tracks.reduce((acc, track) => acc + (track.info.duration || 0), 0);
	const totalDuration = formatTimeToKorean(queuedDuration / 1000);

	const content = [
		`### ${appEmoji('scroll', '📄')} 대기열 목록`,
		...lines,
		``,
		`-# 페이지 ${page}/${totalPages} | 총 ${tracks.length}곡 | ${totalDuration} 남음`
	].join('\n');

	containerComponent.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));

	// 곡 선택 셀렉트 메뉴 — 선택 후 점프/삭제 버튼으로 액션 수행 (controller:queue:select)
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(queueSelectCustomId)
		.setPlaceholder('곡을 선택하세요')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			pageTracks.map((track, index) => {
				const globalIndex = start + index;
				return {
					label: truncate(`#${globalIndex + 1} ${(track as Track).info.title ?? '(제목 없음)'}`, 100),
					value: String(globalIndex + 1),
					description: truncate(
						`${(track as Track).info.author ?? '알 수 없음'} · ${formatTime(((track as Track).info.duration ?? 0) / 1000)}`,
						100
					),
					default: selectedIndex === globalIndex
				};
			})
		);

	containerComponent.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

	// 선택된 곡에 대한 액션 버튼 (controllerButton의 queue:jumpTo / queue:remove)
	const jumpButton = new ButtonBuilder()
		.setCustomId(queueJumpCustomId)
		.setEmoji(appEmoji('arrow_forward', '↪️'))
		.setLabel('점프')
		.setStyle(ButtonStyle.Secondary);

	const removeButton = new ButtonBuilder()
		.setCustomId(queueRemoveCustomId)
		.setEmoji(appEmoji('trash', '🗑️'))
		.setLabel('삭제')
		.setStyle(ButtonStyle.Danger);

	containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(jumpButton, removeButton));

	// Pagination buttons
	if (totalPages > 1) {
		const prevButton = new ButtonBuilder()
			.setCustomId(`${queueCustomIdPrefix}${authorId}:${page - 1}`)
			.setEmoji(appEmoji('arrow_back', '◀️'))
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 1);

		const nextButton = new ButtonBuilder()
			.setCustomId(`${queueCustomIdPrefix}${authorId}:${page + 1}`)
			.setEmoji(appEmoji('arrow_forward', '▶️'))
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= totalPages);

		const pageIndicator = new ButtonBuilder()
			.setCustomId('queue:page:indicator')
			.setLabel(`${page} / ${totalPages}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true);

		containerComponent.addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, pageIndicator, nextButton));
	}

	return containerComponent;
}

export function queueEmpty() {
	return createContainer().addTextDisplayComponents(new TextDisplayBuilder().setContent(`${appEmoji('bag', '📭')} 대기열이 비어있어요.`));
}

export function queueShuffled({ count }: { count: number }) {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${appEmoji('shuffle', '🔀')} 대기열의 **${count}곡**을 셔플했어요.`)
	);
}

export function queueCleared({ count }: { count: number }) {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${appEmoji('trash', '🗑️')} 대기열의 **${count}곡**을 비웠어요.`)
	);
}

export function queueRemoved({ track, position }: { track: Track; position: number }) {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${appEmoji('trash', '🗑️')} \`#${position}\` **${track.info.title}**을(를) 대기열에서 제거했어요.`)
	);
}

export function queueMoved({ track, from, to }: { track: Track; from: number; to: number }) {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${appEmoji('arrow_up', '↕️')} **${track.info.title}**을(를) \`#${from}\` → \`#${to}\`(으)로 이동했어요.`)
	);
}

export const QUEUE_PAGE_SIZE_EXPORT = QUEUE_PAGE_SIZE;
