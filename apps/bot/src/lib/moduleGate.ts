import { gatedModuleForCommand, gatedModuleForNamespace, moduleDisabledMessage, type BotModuleId } from '@sirubot/utils/modules';

/**
 * 모듈 꺼짐 판정 (P-06) — 슬래시 명령 precondition, 버튼·셀렉트·모달 라우터, 메시지 기능 리스너가 같은 규칙을 써요.
 * 어떤 명령·namespace가 어느 모듈인지는 `@sirubot/utils/modules`가 정하고, 여기는 "꺼져 있으면 거절"만 해요.
 * 서비스·Discord 객체를 몰라서 순수하게 테스트할 수 있어요. 켜짐 조회는 호출하는 쪽이 `isEnabled`로 넘겨요.
 */
export type ModuleGateResult = { allowed: true } | { allowed: false; moduleId: BotModuleId; message: string };

export type ModuleEnabledLookup = (moduleId: BotModuleId) => Promise<boolean>;

const ALLOWED: ModuleGateResult = { allowed: true };

async function gate(moduleId: BotModuleId | null, isEnabled: ModuleEnabledLookup): Promise<ModuleGateResult> {
	if (!moduleId) return ALLOWED;
	if (await isEnabled(moduleId)) return ALLOWED;
	return { allowed: false, moduleId, message: moduleDisabledMessage(moduleId) };
}

/** 슬래시 명령 이름(영어 piece 이름) 검사. 도움말·개인정보·모듈 표에 없는 명령은 항상 허용이에요. */
export function gateCommand(commandName: string, isEnabled: ModuleEnabledLookup): Promise<ModuleGateResult> {
	return gate(gatedModuleForCommand(commandName), isEnabled);
}

/** 버튼·셀렉트·모달의 customId namespace 검사. 도움말·온보딩·모르는 namespace는 항상 허용이에요. */
export function gateNamespace(namespace: string | null, isEnabled: ModuleEnabledLookup): Promise<ModuleGateResult> {
	return gate(namespace ? gatedModuleForNamespace(namespace) : null, isEnabled);
}
