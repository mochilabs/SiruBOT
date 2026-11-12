import { emoji } from '@sirubot/utils';
import { MessageFlags } from 'discord.js';
import { notice } from '../../../modules/general/view/notice.ts';
import type { SponsorBlockMessagePort } from '../application/sponsorBlockService.ts';

/** SponsorBlock 카테고리 → 안내에 보여줄 이름 */
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

/**
 * 재생 흐름 서비스(`application/`)가 채널에 직접 올리는 메시지의 Discord 렌더링.
 * 서비스는 포트를 통해 메시지 옵션만 받고, 전송과 삭제 예약은 서비스가 맡아요.
 */
export const playbackMessages: SponsorBlockMessagePort = {
	skipNotice: (category) => ({
		components: [notice(`${emoji('arrow_forward')} [SponsorBlock] **${SPONSOR_CATEGORY_NAMES[category] ?? category}** 구간을 건너뛰었어요.`)],
		flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications]
	})
};
