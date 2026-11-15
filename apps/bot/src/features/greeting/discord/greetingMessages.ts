import type { GreetingMessagePort } from '../application/memberGreetingService.ts';
import { greetingComponents } from './views/greeting.ts';

/** 멤버 인사 서비스가 보내는 인사 메시지 컴포넌트의 Discord 렌더링 */
export const greetingMessages: GreetingMessagePort = {
	components: (input) => greetingComponents(input)
};
