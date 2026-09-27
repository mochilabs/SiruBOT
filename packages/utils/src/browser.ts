export * from './version.js';
export * from './constants.js';
export * from './format.js';
export * from './time.js';
export * from './array.js';
export * from './memoryCache.js';

export { isDev } from './env.js';

export function pickRandom<T>(array: readonly T[]): T {
	const { length } = array;
	return array[Math.floor(Math.random() * length)];
}
