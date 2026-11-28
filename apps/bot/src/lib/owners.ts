import { getConfig } from './config.ts';

export const isOwner = (userId: string): boolean => getConfig().discord.owners.includes(userId);
