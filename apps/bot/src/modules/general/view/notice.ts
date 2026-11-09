import { createContainer } from '@sirubot/utils';

/** 텍스트 블록 안내 컨테이너. 경고 톤은 accentColor에 WARN_COLOR를 넘겨요. */
export function notice(message: string, accentColor?: number) {
	const container = createContainer().addTextDisplayComponents((text) => text.setContent(message));
	if (accentColor !== undefined) container.setAccentColor(accentColor);
	return container;
}
