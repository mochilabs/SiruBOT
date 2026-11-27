import { createContainer, emoji } from '@sirubot/utils';
import type { DailyHoroscope, HoroscopeData } from '../../../../services/types.ts';

export function formatOhaasaDate(raw: string): string {
	const compact = raw.replace(/\//g, '');
	if (/^\d{8}$/.test(compact)) return `${compact.slice(0, 4)}/${compact.slice(4, 6)}/${compact.slice(6, 8)}`;
	return raw;
}

const sourceLine = (daily: DailyHoroscope) => `-# 출처: ${daily.source === 'ohaasa' ? '아사히 방송 오하아사' : 'TV 아사히'}`;

export function ohaasaSingleLines(daily: DailyHoroscope, target: HoroscopeData, hasCard: boolean): string[] {
	if (hasCard) {
		return [target.content || '오늘의 운세 정보가 없어요.', `${emoji('clover')} ${target.lucky || '럭키 정보 없음'}`, '', sourceLine(daily)];
	}
	return [
		`### ${emoji('crystal_ball')} 오늘의 오하아사 (${formatOhaasaDate(daily.date)})`,
		'',
		`**${target.rank}위 · ${target.zodiac.ko} (${target.zodiac.jp})**`,
		target.content || '오늘의 운세 정보가 없어요.',
		`${emoji('clover')} ${target.lucky || '럭키 정보 없음'}`,
		'',
		sourceLine(daily)
	];
}

const TOP_HINT =
	'-# 생일이나 별자리를 지정하면 내 운세만 볼 수 있어요. 예: `/오하아사 별자리:양자리` · `/프로필 생일설정`에 등록하면 지정 없이도 자동으로 보여줘요.';

export function ohaasaTopLines(daily: DailyHoroscope, hasCard: boolean): string[] {
	const lines = hasCard ? [] : [`### ${emoji('crystal_ball')} 오늘의 오하아사 TOP 3 (${formatOhaasaDate(daily.date)})`, ''];
	for (const item of daily.horoscopes.slice(0, 3)) {
		lines.push(`**${item.rank}위 ${item.zodiac.ko}** · ${item.content || '정보 없음'}`);
	}
	lines.push('', TOP_HINT);
	return lines;
}

export function ohaasaView(lines: string[], imageFilename: string | null) {
	const container = createContainer();
	if (imageFilename) {
		container.addMediaGalleryComponents((gallery) =>
			gallery.addItems((item) => item.setURL(`attachment://${imageFilename}`).setDescription('오늘의 운세 카드'))
		);
	}
	return container.addTextDisplayComponents((text) => text.setContent(lines.join('\n')));
}
