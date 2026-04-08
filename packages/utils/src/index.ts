/**
 * Picks a random item from an array
 * @param array The array to pick a random item from
 * @example
 * const randomEntry = pickRandom([1, 2, 3, 4]) // 1
 */
export function pickRandom<T>(array: readonly T[]): T {
	const { length } = array;
	return array[Math.floor(Math.random() * length)];
}

export const isDev = process.env.NODE_ENV !== 'production';

export * from './version.js';
export * from './constants.js';
export * from './format.js';
export * from './time.js';
export * from './youtube.js';
export * from './array.js';
export * from './embed.js';
export * from './memoryCache.js';
export * from './logger.js';
