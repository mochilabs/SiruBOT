import { MessageFlags } from 'discord.js';
import { notice } from '../../../lib/notice.ts';
import type { TempVoiceMessagePort } from '../application/tempVoiceService.ts';

export const tempVoiceMessages: TempVoiceMessagePort = {
	notice: (message, accentColor) => ({ components: [notice(message, accentColor)], flags: [MessageFlags.IsComponentsV2] })
};
