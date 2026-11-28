import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { themeEmojiName } from './guildSettingsContract.js';
import { currentThemePreset } from './themeContext.js';

type EmojiIdMap = Record<string, string>;

const APP_EMOJI_FALLBACKS = {
	arrow_back: '⏮️',
	arrow_down: '⬇️',
	arrow_forward: '⏭️',
	arrow_up: '⬆️',
	artist: '💿',
	artist_l: '💿',
	bag: '👜',
	bell: '🔔',
	boom: '💥',
	box: '📦',
	pause: '⏸️',
	broken_heart: '💔',
	bulb: '💡',
	cake: '🍰',
	calendar: '📅',
	cat: '🐱',
	cd: '💿',
	dashboard: '🖥️',
	chapter: '🎬',
	chapter_l: '🎬',
	chart: '📊',
	clipboard: '📋',
	clock: '🕐',
	cloudy: '☁️',
	clover: '🍀',
	coin: '🪙',
	crown: '👑',
	crystal_ball: '🔮',
	dice: '🎲',
	disk: '💾',
	drop: '💧',
	end_flag: '🔚',
	error: '❌',
	eye: '👁️',
	film: '🎬',
	fire: '🔥',
	fist: '✊',
	fist_bump: '👊',
	flash: '⚡',
	folder: '📁',
	frame: '🖼️',
	gamepad: '🎮',
	gem: '💎',
	globe: '🌐',
	headphone: '🎧',
	heart: '❤️',
	hourglass: '⏳',
	house: '🏠',
	id: '🆔',
	inbox_tray: '📥',
	info: 'ℹ️',
	key: '🔑',
	link: '🔗',
	lock: '🔒',
	mag: '🔍',
	megaphone: '📢',
	mic: '🎤',
	money: '💰',
	mask: '🎭',
	music_note: '🎵',
	music_notes: '🎶',
	palette: '🎨',
	party: '🎉',
	people: '👥',
	pin: '📌',
	play: '▶️',
	plus: '➕',
	radio_wave: '📡',
	rain: '🌧️',
	repeat: '🔁',
	repeat_one: '🔂',
	repeat_off: '➡️',
	robot: '🤖',
	scissors: '✂️',
	scroll: '📄',
	shield: '🛡️',
	shuffle: '🔀',
	stop: '⏹️',
	sleep: '😴',
	melt: '🫠',
	sad: '😭',
	smile: '😀',
	sparkle: '✨',
	spectrum: '📊',
	speech: '💬',
	sprout: '🌱',
	star: '⭐',
	success: '✅',
	sun_cloud: '⛅',
	thermo: '🌡️',
	ticket: '🎫',
	tools: '🛠️',
	trash: '🗑️',
	trophy: '🏆',
	user: '👤',
	volume_muted: '🔇',
	volume_down: '🔉',
	volume_up: '🔊',
	warning: '⚠️',
	wave: '👋',
	windy: '🌬️'
} as const;

export type AppEmojiFallbackKey = keyof typeof APP_EMOJI_FALLBACKS;

export function emoji(name: AppEmojiFallbackKey): string;
export function emoji(name: string, fallback: string): string;
export function emoji(name: string, fallback?: string): string {
	const fallbackText = fallback ?? (name in APP_EMOJI_FALLBACKS ? APP_EMOJI_FALLBACKS[name as AppEmojiFallbackKey] : '❓');
	const themed = themeEmojiName(name, currentThemePreset());
	const resolvedName = cachedMap?.[themed] ? themed : name;
	const id = cachedMap?.[resolvedName];
	if (!id) return fallbackText;
	if (!/^[a-z0-9_]{2,32}$/.test(resolvedName)) return fallbackText;
	return `<:${resolvedName}:${id}>`;
}

let cachedMap: EmojiIdMap | null = null;
let loadPromise: Promise<EmojiIdMap> | null = null;
let retryScheduled = false;

function candidatePaths(): string[] {
	return [
		join(process.cwd(), 'resources', 'emoji_replacement', 'emoji-ids.json'),
		join(process.cwd(), '..', '..', 'resources', 'emoji_replacement', 'emoji-ids.json'),
		join(process.cwd(), 'resources', 'emoji-ids.json'),
		join(process.cwd(), 'apps', 'bot', 'resources', 'emoji-ids.json'),
		join('/app', 'resources', 'emoji_replacement', 'emoji-ids.json')
	];
}

async function loadEmojiIdMap(): Promise<EmojiIdMap> {
	for (const path of candidatePaths()) {
		try {
			const raw = await readFile(/* turbopackIgnore: true */ path, 'utf-8');
			const parsed = JSON.parse(raw) as EmojiIdMap;
			if (parsed && typeof parsed === 'object') return parsed;
		} catch {}
	}
	return {};
}

export function setAppEmojiIdMap(map: EmojiIdMap): void {
	if (map && Object.keys(map).length) cachedMap = { ...cachedMap, ...map };
}

export async function ensureAppEmojisLoaded(): Promise<void> {
	if (cachedMap) return;
	loadPromise ??= loadEmojiIdMap();

	const map = await loadPromise;
	if (Object.keys(map).length) {
		cachedMap = map;
		return;
	}
	loadPromise = null;
	if (!retryScheduled) {
		retryScheduled = true;
		setTimeout(() => void ensureAppEmojisLoaded(), 30_000).unref?.();
	}
}
