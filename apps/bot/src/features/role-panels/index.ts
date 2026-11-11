/**
 * 역할 패널 기능의 공개 표면. 다른 feature나 core/services는 이 파일을 통해서만 들어와요.
 * (Sapphire 피스는 features/role-panels/discord 아래에서 스토어가 직접 읽어요.)
 */
export { deletePostedMessage, PanelPostError, resolvePanelChannel, RolePanelService } from './application/rolePanelService.ts';
export { RoleValidationResponder } from './inbound/roleValidationResponder.ts';
