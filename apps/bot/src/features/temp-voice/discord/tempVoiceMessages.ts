import { MessageFlags } from 'discord.js';
import { notice } from '../../../lib/notice.ts';
import type { TempVoiceMessagePort } from '../application/tempVoiceService.ts';

/** 임시방 서비스가 마커 채널에 올리는 안내 메시지의 Discord 렌더링 */
export const tempVoiceMessages: TempVoiceMessagePort = {
	notice: (message, accentColor) => ({ components: [notice(message, accentColor)], flags: [MessageFlags.IsComponentsV2] })
};
