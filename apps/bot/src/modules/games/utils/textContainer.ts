import { createContainer } from '@sirubot/utils';

/** 게임 모듈 공통 응답 컨테이너: 텍스트 라인을 이어 붙여 하나의 컨테이너로 만든다. */
export function textContainer(lines: string[]) {
	return createContainer().addTextDisplayComponents((t) => t.setContent(lines.join('\n')));
}
