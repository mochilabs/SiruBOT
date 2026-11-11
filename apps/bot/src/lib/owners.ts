import { getConfig } from '../core/config.ts';

/** 봇 소유자 여부 — OwnerOnly 전제조건과 /eval 모달 게이트가 함께 쓰는 단일 원본. (Config는 호출 시점에 읽어요) */
export const isOwner = (userId: string): boolean => getConfig().discord.owners.includes(userId);
