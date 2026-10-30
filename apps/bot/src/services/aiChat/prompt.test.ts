import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';

const mocks = vi.hoisted(() => ({
	getDJRole: vi.fn(),
	getPlayer: vi.fn()
}));

const mockGuildMembers = new Map<string, unknown>();

vi.mock('@sapphire/framework', () => ({
	container: {
		guildService: {
			getDJRole: mocks.getDJRole
		},
		audio: {
			getPlayer: mocks.getPlayer
		},
		client: {
			guilds: {
				cache: {
					get: vi.fn((guildId: string) => {
						if (guildId !== 'g-1') return null;
						return {
							id: 'g-1',
							members: {
								cache: {
									get: (userId: string) => mockGuildMembers.get(userId)
								}
							}
						};
					})
				}
			}
		}
	}
}));

import { buildDiscordContextBlock, buildSystemContent } from './prompt.ts';

describe('buildDiscordContextBlock (사용자 권한 컨텍스트 주입)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGuildMembers.clear();
		mocks.getPlayer.mockReturnValue(null);
	});

	it('서버 관리(ManageGuild) 권한이 있는 사용자의 권한을 명시한다', async () => {
		mocks.getDJRole.mockResolvedValue('role-dj');
		mockGuildMembers.set('u-admin', {
			id: 'u-admin',
			displayName: '서버장',
			permissions: {
				has: (perm: bigint) => perm === PermissionFlagsBits.ManageGuild || perm === PermissionFlagsBits.Administrator
			},
			roles: { cache: { has: () => false } },
			voice: null
		});

		const block = await buildDiscordContextBlock('g-1', 'u-admin');
		expect(block).toContain('# 현재 상황 컨텍스트');
		expect(block).toContain('- 사용자(서버장) 권한: 서버 관리(ManageGuild), DJ 역할');
	});

	it('DJ 역할만 있는 사용자의 권한을 명시한다', async () => {
		mocks.getDJRole.mockResolvedValue('role-dj');
		mockGuildMembers.set('u-dj', {
			id: 'u-dj',
			displayName: '디제이',
			permissions: { has: () => false },
			roles: { cache: { has: (r: string) => r === 'role-dj' } },
			voice: null
		});

		const block = await buildDiscordContextBlock('g-1', 'u-dj');
		expect(block).toContain('- 사용자(디제이) 권한: DJ 역할');
	});

	it('권한이 없는 일반 사용자의 경우 "일반 권한(설정 변경 권한 없음)"을 명시한다', async () => {
		mocks.getDJRole.mockResolvedValue('role-dj');
		mockGuildMembers.set('u-normal', {
			id: 'u-normal',
			displayName: '일반유저',
			permissions: { has: () => false },
			roles: { cache: { has: () => false } },
			voice: null
		});

		const block = await buildDiscordContextBlock('g-1', 'u-normal');
		expect(block).toContain('- 사용자(일반유저) 권한: 일반 권한(설정 변경 권한 없음)');
	});

	it('서버에 DJ 역할이 미설정된 경우 DJ 권한 허용 상태를 명시한다', async () => {
		mocks.getDJRole.mockResolvedValue(null);
		mockGuildMembers.set('u-guest', {
			id: 'u-guest',
			displayName: '게스트',
			permissions: { has: () => false },
			roles: { cache: { has: () => false } },
			voice: null
		});

		const block = await buildDiscordContextBlock('g-1', 'u-guest');
		expect(block).toContain('- 사용자(게스트) 권한: DJ 권한(서버 DJ 미설정으로 음악 제어 가능)');
	});

	it('현재 재생 중인 음악과 음성 채널 정보도 함께 포함한다', async () => {
		mocks.getDJRole.mockResolvedValue(null);
		mockGuildMembers.set('u-voice', {
			id: 'u-voice',
			displayName: '청취자',
			permissions: { has: () => false },
			roles: { cache: { has: () => false } },
			voice: {
				channel: {
					name: '음악감상실',
					members: {
						size: 2,
						map: (fn: (m: { displayName: string }) => string) => [{ displayName: '청취자' }, { displayName: '친구' }].map(fn)
					}
				}
			}
		});

		mocks.getPlayer.mockReturnValue({
			paused: false,
			queue: {
				current: {
					info: { title: '좋은 날', author: '아이유' }
				}
			}
		});

		const block = await buildDiscordContextBlock('g-1', 'u-voice');
		expect(block).toContain('- 사용자 음성 채널: #음악감상실 (참여 2명: 청취자, 친구)');
		expect(block).toContain('- 현재 음악: 좋은 날 (아이유) [재생 중]');
	});
});

describe('buildSystemContent (설정 및 권한 지침 확인)', () => {
	it('시스템 프롬프트에 음악/봇 설정 도구 및 권한 거절 규칙이 포함되어 있다', () => {
		const prompt = buildSystemContent({
			messages: [],
			pending: [],
			summary: null,
			tokens: 0
		});

		expect(prompt).toContain('music_settings_get');
		expect(prompt).toContain('music_settings_set');
		expect(prompt).toContain('bot_settings_get');
		expect(prompt).toContain('bot_settings_set');
		expect(prompt).toContain('설정 변경 권한 규칙');
		expect(prompt).toContain('서버 관리(ManageGuild)');
		expect(prompt).toContain('DJ 역할');
	});
});
