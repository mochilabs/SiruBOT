import type { RolePanelMessagePort } from '../application/rolePanelService.ts';
import { rolePanelView } from './views/rolePanel.ts';

/** 역할 패널 서비스가 게시·갱신하는 패널 메시지의 Discord 렌더링 */
export const rolePanelMessages: RolePanelMessagePort = {
	panel: (panel, buttons) => rolePanelView(panel, buttons)
};
