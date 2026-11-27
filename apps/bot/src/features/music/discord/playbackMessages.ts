import { emoji } from '@sirubot/utils';
import { MessageFlags } from 'discord.js';
import { notice } from '../../../lib/notice.ts';
import type { SponsorBlockMessagePort } from '../application/sponsorBlockService.ts';

const SPONSOR_CATEGORY_NAMES: Record<string, string> = {
	sponsor: '프로모션',
	selfpromo: '자사 홍보',
	interaction: '상호 작용 요청',
	intro: '인트로',
	outro: '아웃트로',
	preview: '미리보기',
	music_offtopic: '음악이 아닌',
	filler: '빈'
};

export const playbackMessages: SponsorBlockMessagePort = {
	skipNotice: (category) => ({
		components: [notice(`${emoji('arrow_forward')} [SponsorBlock] **${SPONSOR_CATEGORY_NAMES[category] ?? category}** 구간을 건너뛰었어요.`)],
		flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications]
	})
};
