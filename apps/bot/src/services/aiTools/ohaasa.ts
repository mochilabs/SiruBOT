import { fetchOhaasa } from '../../modules/games/utils/ohaasaService.ts';
import type { AiTool } from './types.ts';

export const ohaasaTool: AiTool = {
	name: 'get_ohaasa_horoscope',
	description:
		'오하아사(아사히 방송)의 12별자리 운세를 조회해요. zodiac 별칭(병자, 염소자리, water_goat 등)을 받으면 해당 별자리만 돌려주고, 없으면 오늘 전체 운세를 돌려줘요. 점괘(rank, content, lucky)를 자연스럽게 한국어로 전달하세요.',
	properties: {
		zodiac: {
			type: 'string',
			description: '별자리 (선택). 예: 염소자리, 물병자리, 병자, water_goat — 생일로 유추해도 돼요'
		}
	},
	required: [],
	status: '시루가 오늘의 운세를 확인하는 중..',
	execute: async (args) => {
		const daily = await fetchOhaasa();
		const zodiacArg = String(args.zodiac ?? '').trim();
		if (!zodiacArg) return JSON.stringify(daily);

		const hit = daily.horoscopes.find(
			(h) => h.zodiacCode === zodiacArg || h.zodiac.ko === zodiacArg || h.zodiac.jp === zodiacArg || h.zodiac.en === zodiacArg
		);
		if (!hit) throw new Error(`별자리를 찾지 못했어요: ${zodiacArg}`);
		return JSON.stringify({ date: daily.date, source: daily.source, ...hit });
	}
};
