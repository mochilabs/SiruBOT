import { envParseArray } from '@skyra/env-utilities';

/** 봇 소유자 목록 — OwnerOnly 전제조건과 /eval 모달 게이트가 함께 쓰는 단일 원본. */
export const OWNERS = envParseArray('OWNERS');
