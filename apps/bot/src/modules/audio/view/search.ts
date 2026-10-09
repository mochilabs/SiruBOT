import { addSeparator, emoji, createContainer, formatTime } from '@sirubot/utils';
import { ActionRowBuilder, ContainerBuilder, StringSelectMenuBuilder, TextDisplayBuilder } from 'discord.js';
import { Track, UnresolvedTrack } from 'lavalink-client';

/** /검색 결과 셀렉트 메뉴의 customId — 신규 핸들러는 이 값으로 파싱한다. */
export const searchSelectCustomId = 'search:select';

/** 문자열을 max_length 이하로 줄이고 넘치는 부분은 …로 대체한다. (undefined도 안전하게) */
function truncate(text: string | undefined, maxLength: number): string {
	const value = text ?? '';
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

/** 트랙 길이(ms)를 formatTime이 기대하는 초 단위로 넘겨 m:ss 포맷으로 만든다. */
function trackDurationText(track: Track | UnresolvedTrack): string {
	return formatTime((track.info.duration ?? 0) / 1000);
}

/** 검색 결과 — 곡 목록과 선택형 셀렉트 메뉴를 담은 컨테이너. */
export function searchResults(query: string, tracks: (Track | UnresolvedTrack)[]): ContainerBuilder {
	// createContainer()가 DEFAULT_COLOR로 accent color를 설정한다.
	const container = createContainer();

	container.addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${emoji('magnet')} **${query}** 검색 결과예요. 재생할 곡을 선택해 주세요.`)
	);
	addSeparator(container);

	// 곡 목록 — 제목 60자, 아티스트 40자에서 절단
	const listText = tracks
		.map(
			(track, index) =>
				`${index + 1}. **${truncate(track.info.title ?? '(제목 없음)', 60)}** · ${truncate(track.info.author ?? '알 수 없음', 40)} · ${trackDurationText(track)}`
		)
		.join('\n');
	container.addTextDisplayComponents(new TextDisplayBuilder().setContent(listText));

	addSeparator(container);

	// 선택형 셀렉트 메뉴 — label/description은 디스코드 제한(100자) 이내, 옵션은 최대 25개까지 보장해야 한다.
	const selectMenu = new StringSelectMenuBuilder()
		.setCustomId(searchSelectCustomId)
		.setPlaceholder('재생할 곡을 선택하세요')
		.setMinValues(1)
		.setMaxValues(1)
		.addOptions(
			tracks.map((track, index) => ({
				label: truncate(`${index + 1}. ${track.info.title ?? '(제목 없음)'}`, 100),
				value: String(index),
				description: truncate(`${track.info.author ?? '알 수 없음'} · ${trackDurationText(track)}`, 100)
			}))
		);

	container.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));

	return container;
}

/** 검색 시간 초과 안내 — 재생 컨트롤 정보가 없는 단순 안내 컨테이너. */
export function searchTimeout(): ContainerBuilder {
	return createContainer().addTextDisplayComponents(
		new TextDisplayBuilder().setContent(`${emoji('hourglass')} 시간이 지나 검색을 취소했어요. 다시 /검색 을 사용해 주세요.`)
	);
}
