import { describe, expect, it, vi } from 'vitest';
import { isAllowedImageUrl, loadImageAllowed } from './images.ts';

describe('isAllowedImageUrl (이미지 allowlist)', () => {
	it('Discord CDN·유튜브 썸네일 호스트만 허용해요', () => {
		expect(isAllowedImageUrl('https://cdn.discordapp.com/avatars/1/a.png')).toBe(true);
		expect(isAllowedImageUrl('https://media.discordapp.net/attachments/1/2/x.png')).toBe(true);
		expect(isAllowedImageUrl('https://i.ytimg.com/vi/abc/hqdefault.jpg')).toBe(true);
		expect(isAllowedImageUrl('https://img.youtube.com/vi/abc/0.jpg')).toBe(true);
		expect(isAllowedImageUrl('https://yt3.ggpht.com/a/photo.jpg')).toBe(true);
	});

	it('허용 호스트가 아니면 거부해요', () => {
		expect(isAllowedImageUrl('https://example.com/a.png')).toBe(false);
		expect(isAllowedImageUrl('https://cdn.discordapp.com.evil.example/a.png')).toBe(false);
		expect(isAllowedImageUrl('https://evilcdn.discordapp.com/a.png')).toBe(false);
	});

	it('http/https가 아니면 거부해요', () => {
		expect(isAllowedImageUrl('ftp://cdn.discordapp.com/a.png')).toBe(false);
		expect(isAllowedImageUrl('file:///etc/passwd')).toBe(false);
		expect(isAllowedImageUrl('javascript:alert(1)')).toBe(false);
	});

	it('URL로 파싱할 수 없으면 거부해요', () => {
		expect(isAllowedImageUrl('not a url')).toBe(false);
		expect(isAllowedImageUrl('')).toBe(false);
	});

	it('호스트 대소문자·포트·경로는 판정에 영향 없어요', () => {
		expect(isAllowedImageUrl('https://CDN.DISCORDAPP.COM/a.png')).toBe(true);
		expect(isAllowedImageUrl('https://cdn.discordapp.com:443/a.png?v=1')).toBe(true);
	});
});

describe('loadImageAllowed', () => {
	it('허용 호스트가 아니면 fetch를 아예 시도하지 않아요', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		try {
			await expect(loadImageAllowed('https://example.com/a.png')).resolves.toBeNull();
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			fetchSpy.mockRestore();
		}
	});

	it('허용 호스트는 fetch를 시도하고 실패하면 null을 돌려줘요', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
		try {
			await expect(loadImageAllowed('https://cdn.discordapp.com/avatars/1/a.png')).resolves.toBeNull();
			expect(fetchSpy).toHaveBeenCalledOnce();
		} finally {
			fetchSpy.mockRestore();
		}
	});
});
