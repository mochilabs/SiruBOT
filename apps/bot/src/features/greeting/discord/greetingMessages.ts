import type { GreetingMessagePort } from '../application/memberGreetingService.ts';
import { greetingComponents } from './views/greeting.ts';

export const greetingMessages: GreetingMessagePort = {
	components: (input) => greetingComponents(input)
};
