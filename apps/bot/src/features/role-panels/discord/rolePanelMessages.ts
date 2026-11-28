import type { RolePanelMessagePort } from '../application/rolePanelService.ts';
import { rolePanelView } from './views/rolePanel.ts';

export const rolePanelMessages: RolePanelMessagePort = {
	panel: (panel, buttons) => rolePanelView(panel, buttons)
};
