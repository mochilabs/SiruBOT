# 서버 이미지 에셋 + S3 스타일 스토리지 구현 계획

> **For agent:** 이 계획은 task 단위(2~5분 step)로 쪼개져 있어요. 순서대로 하나씩 실행하며 각 task 끝의 커밋으로 마감해요.

**Goal:** 커스텀 명령어의 썸네일·이미지 갤러리에 쓸 이미지를 업로드하고, 길드 단위 에셋으로 등록해 여러 명령어에서 재사용할 수 있게 만든다.

**Architecture:** 신규 앱 `apps/storage`가 S3 스타일(버킷/키) 오브젝트를 로컬 볼륨에 저장한다. GET은 공개라서 디스코드 이미지 프록시가 직접 임베드하고, PUT/LIST/DELETE는 우리 AUTH_KEY 헤더로 보호한다. 대시보드가 업로드를 프록시해 `GuildAsset` 메타데이터를 DB에 남기고, 커스텀 명령어 빌더가 에셋을 선택한다. 커스텀 명령어 스펙은 기존처럼 https URL만 들고 있어서 봇(apps/bot) 수정은 없다.

**Tech Stack:** Fastify 5 + zod(apps/storage), Prisma(`GuildAsset`), Next.js API Route + SWR(dashboard), vitest, tsup.

## 확정된 결정 사항

| 항목 | 결정 |
| --- | --- |
| 호스팅 | 자체 storage 서비스(`apps/storage`), S3 스타일 버킷/키 |
| 인증 | SigV4 없음. `Authorization` 헤더에 우리 키 원문 (`STORAGE_AUTH_KEY ?? AUTH_KEY`), 미설정 시 기동 거부(fail-closed) |
| 디스코드 노출 | 공개 GET URL 직접 임베드 (디스코드 이미지 프록시가 fetch) |
| 버킷/키 | bucket `guild-assets`, key `{guildId}/{assetId}.{ext}` |
| 파일 규격 | 상한 8MiB, mime 화이트리스트 `png/jpeg/webp/gif`, 매직 바이트로 실제 형식 검증 |
| DB 소유권 | 스토리지는 파일만 보관(무DB), 메타데이터는 대시보드가 Prisma로 관리 |
| 범위 | 업로드 + 에셋 등록/관리 UI(목록·이름 변경·삭제·URL 복사) + 커맨드 빌더 피커 |

**작업 브랜치:** `feature/guild-assets-storage` (beta 분기, 체크아웃 완료).

**기존 레퍼런스 (코드 읽을 곳):**
- Fastify 앱 골격·인증 플러그인: `apps/data-api/src/server.ts`, `apps/data-api/src/plugins/auth.ts`, `apps/data-api/src/config/env.ts`
- 빌드 설정: `scripts/tsup.config.ts` (`createConfig` 재사용)
- 공용 계약 패턴: `packages/utils/src/customCommand.ts` (zod 스키마 + 상수), export는 `packages/utils/src/index.ts` (`export * from './x.js'`, `.js` 확장자)
- 대시보드 라우트 규약: `apps/dashboard/src/app/api/servers/[id]/greeting/background/route.ts` + `apps/dashboard/src/lib/greeting-image.ts` (multipart 검증 선례), `apps/dashboard/src/lib/api-guards.ts`, `apps/dashboard/src/lib/rate-limit.ts`
- 대시보드 data-api 클라이언트: `apps/dashboard/src/lib/data-api.ts`
- UI 패널/탭: `apps/dashboard/src/components/servers/server-dashboard.tsx` (TABS), `custom-commands-settings.tsx` (PanelHeader 패턴)
- 커맨드 빌더 이미지 필드: `apps/dashboard/src/components/servers/custom-command-designer.tsx` (section.thumbnailUrl, media.urls)
- Docker: 루트 `Dockerfile` (target 분기), `docker/docker-compose.yml`, `docker-stack.yml`

**검증 명령 (task마다):**
```bash
yarn workspace @sirubot/utils test            # 또는 npx vitest run (packages/utils에서)
yarn workspace @sirubot/storage test
yarn workspace @sirubot/storage typecheck
yarn workspace @sirubot/dashboard lint        # eslint . --max-warnings=0
yarn workspace @sirubot/dashboard typecheck
```
주의: 워크스페이스 테스트는 각 워크스페이스 디렉토리에서 실행해야 config가 제대로 잡혀요 (루트에서 직접 vitest를 돌리면 alias 충돌로 실패할 수 있음).

---

## Task 1: 공용 계약 `packages/utils/src/storage.ts`

스토리지·대시보드·(나중의) 봇이 같은 규약을 쓰게 상수·타입·검증 헬퍼를 만든다.

**Files:**
- Create: `packages/utils/src/storage.ts`
- Create: `packages/utils/src/storage.test.ts`
- Modify: `packages/utils/src/index.ts` (export 한 줄 추가)

**Step 1: 실패하는 테스트 작성**

```ts
// packages/utils/src/storage.test.ts
import { describe, expect, it } from 'vitest';
import {
	ASSET_ALLOWED_MIME_TYPES,
	ASSET_BUCKET,
	ASSET_MAX_BYTES,
	assetKeyFor,
	parseAssetKey,
	sniffImageMime
} from './storage.js';

describe('sniffImageMime', () => {
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
	const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
	const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00]);
	const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

	it('이미지 시그니처를 판별해요', () => {
		expect(sniffImageMime(png)).toBe('image/png');
		expect(sniffImageMime(jpeg)).toBe('image/jpeg');
		expect(sniffImageMime(gif)).toBe('image/gif');
		expect(sniffImageMime(webp)).toBe('image/webp');
	});

	it('모르는 형식은 null이에요', () => {
		expect(sniffImageMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
		expect(sniffImageMime(new Uint8Array(2))).toBeNull();
	});
});

describe('assetKeyFor / parseAssetKey', () => {
	it('길드·에셋·mime으로 키를 만들고 다시 파싱해요', () => {
		const key = assetKeyFor('123', 'abc-1', 'image/jpeg');
		expect(key).toBe('123/abc-1.jpg');
		expect(parseAssetKey(key)).toEqual({ guildId: '123', assetId: 'abc-1', ext: 'jpg' });
	});

	it('경로 탈출 조각은 거부해요', () => {
		expect(() => assetKeyFor('../etc', 'x', 'image/png')).toThrow();
		expect(() => assetKeyFor('123', '../x', 'image/png')).toThrow();
		expect(parseAssetKey('123/../../x.png')).toBeNull();
		expect(parseAssetKey('123/nested/x.png')).toBeNull();
	});

	it('상수 계약이 있어요', () => {
		expect(ASSET_BUCKET).toBe('guild-assets');
		expect(ASSET_MAX_BYTES).toBe(8 * 1024 * 1024);
		expect(ASSET_ALLOWED_MIME_TYPES.has('image/gif')).toBe(true);
	});
});
```

**Step 2: 실패 확인**

```bash
cd packages/utils && npx vitest run src/storage.test.ts
```
Expected: FAIL (`Cannot find module './storage.js'` 또는 import 실패)

**Step 3: 구현**

```ts
// packages/utils/src/storage.ts
/**
 * 서버 이미지 에셋 공용 계약 — S3 스타일 스토리지(apps/storage)와 대시보드가 함께 써요.
 * 키 규칙: bucket 'guild-assets' 아래 '{guildId}/{assetId}.{ext}'.
 */
import { z } from 'zod';

export const ASSET_BUCKET = 'guild-assets';
/** 업로드 상한 (바이트) — 디스코드 미디어 갤러리·섹션 썸네일 용도에 충분한 크기예요 */
export const ASSET_MAX_BYTES = 8 * 1024 * 1024;
export const ASSET_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export const ASSET_NAME_MAX_LENGTH = 60;

const MIME_TO_EXT: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
	'image/gif': 'gif'
};

const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 매직 바이트로 실제 이미지 형식을 판별해요 — Content-Type 헤더는 신뢰하지 않아요 */
export function sniffImageMime(bytes: Uint8Array): string | null {
	if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
	if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
	if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
	if (
		bytes.length >= 12 &&
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return 'image/webp';
	}
	return null;
}

/** 에셋 키 생성 — 길드/에셋 ID에 경로 조각이 있으면 거부해요 */
export function assetKeyFor(guildId: string, assetId: string, mime: string): string {
	const ext = MIME_TO_EXT[mime];
	if (!ext) throw new Error(`지원하지 않는 이미지 형식이에요: ${mime}`);
	if (!SAFE_ID_PATTERN.test(guildId) || !SAFE_ID_PATTERN.test(assetId)) {
		throw new Error('에셋 ID 형식이 올바르지 않아요.');
	}
	if (guildId.includes('..') || assetId.includes('..')) throw new Error('에셋 ID 형식이 올바르지 않아요.');
	return `${guildId}/${assetId}.${ext}`;
}

/** 키 파싱 — 규약과 다르면 null (경로 탈출 포함) */
export function parseAssetKey(key: string): { guildId: string; assetId: string; ext: string } | null {
	const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\/([A-Za-z0-9][A-Za-z0-9._-]*)\.(png|jpg|webp|gif)$/.exec(key);
	if (!match) return null;
	if (match[1]!.includes('..') || match[2]!.includes('..')) return null;
	return { guildId: match[1]!, assetId: match[2]!, ext: match[3]! };
}

/** 에셋 이름(사용자 라벨) 검증 — 공백만으로 이루어진 이름 거부 */
export const assetNameSchema = z.string().trim().min(1, '이름을 입력해 주세요.').max(ASSET_NAME_MAX_LENGTH, `${ASSET_NAME_MAX_LENGTH}자 이내로 입력해 주세요.`);
```

**Step 4: export 연결 후 테스트 통과 확인**

`packages/utils/src/index.ts` 마지막 줄 근처에:
```ts
export * from './storage.js';
```

```bash
cd packages/utils && npx vitest run src/storage.test.ts
```
Expected: PASS (6 tests)

**Step 5: 커밋**

```bash
git add packages/utils/src/storage.ts packages/utils/src/storage.test.ts packages/utils/src/index.ts
git commit -m "feat(utils): 서버 이미지 에셋 공용 계약 (키 규칙·매직 바이트 판별·상수)"
```

---

## Task 2: `apps/storage` 스캐폴드 (env·인증·헬스)

**Files:**
- Create: `apps/storage/package.json`, `apps/storage/tsconfig.json`, `apps/storage/tsup.config.ts`
- Create: `apps/storage/src/index.ts`, `apps/storage/src/config/env.ts`, `apps/storage/src/server.ts`
- Create: `apps/storage/src/plugins/auth.ts`, `apps/storage/src/plugins/auth.test.ts`
- Create: `apps/storage/src/routes/health.ts`, `apps/storage/src/routes/health.test.ts`

**Step 1: 패키지 골격**

```json
// apps/storage/package.json
{
    "name": "@sirubot/storage",
    "private": true,
    "version": "0.1.0",
    "type": "module",
    "main": "dist/index.js",
    "types": "dist/index.d.ts",
    "scripts": {
        "lint": "prettier --check \"src/**/*.ts\"",
        "lint:fix": "prettier --write \"src/**/*.ts\"",
        "test": "vitest run --passWithNoTests",
        "typecheck": "tsc --noEmit",
        "build": "tsup",
        "watch": "tsup --watch",
        "start": "node --enable-source-maps ."
    },
    "dependencies": {
        "@sirubot/utils": "*",
        "fastify": "^5.12.7",
        "zod": "^4.1.11"
    }
}
```

`tsconfig.json`과 `tsup.config.ts`는 `apps/data-api`의 것을 복사해 쓰되, `tsup.config.ts`는 다음 형태로:
```ts
import { createConfig } from '../../scripts/tsup.config.js';
export default createConfig({});
```
(data-api의 tsup.config.ts를 열어 동일한 형태인지 확인하고, 다르면 그 파일을 기준으로 맞춰요.)

**Step 2: env + 인증 + 헬스 (실패 테스트 먼저)**

```ts
// apps/storage/src/plugins/auth.test.ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import auth from './auth.ts';

describe('storage auth', () => {
	it('키가 없으면 기동을 거부해요', async () => {
		const fastify = Fastify();
		await expect(auth(fastify, '')).rejects.toThrow();
	});

	it('Authorization 헤더 키가 다르면 401이에요', async () => {
		const fastify = Fastify();
		await auth(fastify, 'secret');
		fastify.get('/x', async () => ({ ok: true }));
		const res = await fastify.inject({ method: 'GET', url: '/x', headers: { authorization: 'wrong' } });
		expect(res.statusCode).toBe(401);
	});

	it('키가 맞으면 통과해요', async () => {
		const fastify = Fastify();
		await auth(fastify, 'secret');
		fastify.get('/x', async () => ({ ok: true }));
		const res = await fastify.inject({ method: 'GET', url: '/x', headers: { authorization: 'secret' } });
		expect(res.statusCode).toBe(200);
	});
});
```

```ts
// apps/storage/src/routes/health.test.ts
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import health from './health.ts';

describe('GET /health', () => {
	it('인증 없이 응답해요', async () => {
		const fastify = Fastify();
		await health(fastify);
		const res = await fastify.inject({ method: 'GET', url: '/health' });
		expect(res.statusCode).toBe(200);
		expect(res.json()).toEqual({ ok: true });
	});
});
```

```bash
cd apps/storage && npx vitest run
```
Expected: FAIL (파일 없음)

**Step 3: 구현**

```ts
// apps/storage/src/config/env.ts
import { z } from 'zod';

const envSchema = z
	.object({
		PORT: z.coerce.number().default(3003),
		// 저장 루트 디렉토리 (Docker에선 볼륨 마운트)
		STORAGE_DATA_DIR: z.string().default('./data'),
		// 공개 GET URL의 베이스 — 디스코드가 임베드로 fetch하는 주소예요 (반드시 https 공개 도메인)
		STORAGE_PUBLIC_URL: z.string().url(),
		// 자체 키를 우선 쓰고, 없으면 봇과 공유하는 AUTH_KEY로 폴백해요 (data-api와 같은 계약)
		STORAGE_AUTH_KEY: z.string().optional(),
		AUTH_KEY: z.string().optional()
	})
	.transform((env) => ({ ...env, storageAuthKey: env.STORAGE_AUTH_KEY ?? env.AUTH_KEY }));

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
	const result = envSchema.safeParse(process.env);
	if (!result.success) {
		console.error('❌ Invalid environment variables:');
		console.error(result.error.format());
		process.exit(1);
	}
	if (!result.data.storageAuthKey) {
		console.error('❌ STORAGE_AUTH_KEY 또는 AUTH_KEY 중 하나는 반드시 설정해야 해요.');
		process.exit(1);
	}
	return result.data;
}
```

```ts
// apps/storage/src/plugins/auth.ts
import type { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'node:crypto';

/**
 * 인증 플러그인 — Authorization 헤더에 키 원문을 받아요 (Bearer 스킴 없음, data-api와 동일).
 * /health와 GET(공개 오브젝트)에는 붙이지 않아요 — 등록한 라우트에만 수동으로 적용해요.
 */
export default async function auth(fastify: FastifyInstance, key: string): Promise<void> {
	if (!key) throw new Error('storage auth key가 비어 있어요 — STORAGE_AUTH_KEY 또는 AUTH_KEY를 설정해야 해요.');
	const expected = Buffer.from(key);

	fastify.addHook('onRequest', async (request, reply) => {
		const provided = request.headers.authorization;
		if (!provided) return reply.code(401).send({ error: '인증 정보가 없어요.' });
		const actual = Buffer.from(provided);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
			return reply.code(401).send({ error: '인증에 실패했어요.' });
		}
	});
}
```
주의: 이 훅은 전역이므로, 공개 라우트(GET 오브젝트·헬스)는 훅이 적용되지 않도록 라우트 등록 순서로 분리해요. Fastify에서 라우트별로 훅을 거는 방법이 더 안전하면 `fastify.addHook('onRequest')` 대신 보호 라우트 래퍼(`requireAuth(fastify)`)로 바꿔도 좋아요. 결정 기준: 공개 GET이 훅에 안 걸리는 게 100% 보장되는 방식 택할 것. (권장: `protectedRoutes` 서브스코프 없이, 공개 GET은 훅 등록 전에 등록하는 대신 **라우트 레벨 `preHandler`**로 보호 라우트에만 붙인다.)

위 주의를 반영한 최종 형태 (이게 실행 기준):
```ts
// auth.ts export 추가: requireAuth(key) → Fastify preHandler
export function requireAuth(key: string) {
	const expected = Buffer.from(key);
	return async (request: Parameters<Parameters<FastifyInstance['get']>[2]>[0] extends never ? never : any, reply: any) => {
		const provided = request.headers.authorization;
		if (!provided) return reply.code(401).send({ error: '인증 정보가 없어요.' });
		const actual = Buffer.from(provided);
		if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
			return reply.code(401).send({ error: '인증에 실패했어요.' });
		}
	};
}
```
(위 타입은 `FastifyRequest`/`FastifyReply`로 명시적으로 고쳐 쓸 것. 테스트는 preHandler 버전 기준으로 맞춰요.)

```ts
// apps/storage/src/routes/health.ts
import type { FastifyInstance } from 'fastify';

/** 헬스체크 — 인증 없이 응답해요 */
export default async function health(fastify: FastifyInstance): Promise<void> {
	fastify.get('/health', async () => ({ ok: true }));
}
```

```ts
// apps/storage/src/server.ts
import Fastify from 'fastify';
import type { Env } from './config/env.ts';
import { requireAuth } from './plugins/auth.ts';
import health from './routes/health.ts';

export async function buildServer(env: Env) {
	const fastify = Fastify({ logger: false, genReqId: () => crypto.randomUUID() });
	fastify.addHook('onSend', async (request, reply) => {
		reply.header('x-request-id', request.id);
	});
	const guard = requireAuth(env.storageAuthKey!);
	await health(fastify);
	// TODO Task 3~5: objects 라우트 (PUT preHandler=guard, GET 공개, LIST/DELETE preHandler=guard)
	return { fastify, guard };
}
```

```ts
// apps/storage/src/index.ts
import { validateEnv } from './config/env.ts';
import { buildServer } from './server.ts';

const env = validateEnv();
const { fastify } = await buildServer(env);
const close = async () => {
	await fastify.close();
};
process.on('SIGINT', () => void close().then(() => process.exit(0)));
process.on('SIGTERM', () => void close().then(() => process.exit(0)));
await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
```

**Step 4: 테스트·타입체크·린트 통과**

```bash
cd apps/storage && npx vitest run && npx tsc --noEmit && npx prettier --check "src/**/*.ts"
```
Expected: PASS / 오류 없음

**Step 5: 커밋**

```bash
git add apps/storage packages 2>/dev/null; git add apps/storage
git commit -m "feat(storage): S3 스타일 스토리지 스캐폴드 (env fail-closed 인증·헬스)"
```

---

## Task 3: 오브젝트 저장소 + PUT 업로드

**Files:**
- Create: `apps/storage/src/services/objectStore.ts`, `apps/storage/src/services/objectStore.test.ts`
- Create: `apps/storage/src/routes/objects.ts` (PUT만 먼저), `apps/storage/src/routes/objects.put.test.ts`
- Modify: `apps/storage/src/server.ts` (라우트 등록)

**Step 1: objectStore 실패 테스트**

```ts
// apps/storage/src/services/objectStore.test.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ObjectStore } from './objectStore.ts';

let dir: string;
let store: ObjectStore;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
	store = new ObjectStore(dir);
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('ObjectStore', () => {
	it('저장·조회·삭제가 동작해요', async () => {
		await store.put('guild-assets', 'g1/a.png', new Uint8Array([1, 2, 3]), 'image/png');
		const got = await store.get('guild-assets', 'g1/a.png');
		expect(got).not.toBeNull();
		expect(got!.bytes.length).toBe(3);
		expect(got!.contentType).toBe('image/png');
		await store.delete('guild-assets', 'g1/a.png');
		expect(await store.get('guild-assets', 'g1/a.png')).toBeNull();
	});

	it('경로 탈출 키는 거부해요', async () => {
		await expect(store.put('guild-assets', '../escape.png', new Uint8Array([1]), 'image/png')).rejects.toThrow();
		await expect(store.get('guild-assets', 'a/../../etc/passwd')).rejects.toThrow();
	});

	it('prefix로 목록을 뽑아요', async () => {
		await store.put('guild-assets', 'g1/a.png', new Uint8Array([1]), 'image/png');
		await store.put('guild-assets', 'g1/b.png', new Uint8Array([2]), 'image/png');
		await store.put('guild-assets', 'g2/c.png', new Uint8Array([3]), 'image/png');
		const listed = await store.list('guild-assets', 'g1/');
		expect(listed.map((o) => o.key).sort()).toEqual(['g1/a.png', 'g1/b.png']);
	});
});
```

**Step 2: 실패 확인** (`cd apps/storage && npx vitest run src/services/objectStore.test.ts` → FAIL)

**Step 3: 구현**

```ts
// apps/storage/src/services/objectStore.ts
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface StoredObject {
	key: string;
	size: number;
	contentType: string;
	lastModified: string;
	etag: string;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 버킷/키 → 파일 경로. 세그먼트 검증으로 경로 탈출을 막아요 */
function resolvePath(root: string, bucket: string, key: string): string {
	const segments = [bucket, ...key.split('/')];
	for (const segment of segments) {
		if (!SAFE_SEGMENT.test(segment) || segment.includes('..')) {
			throw new Error('경로가 올바르지 않아요.');
		}
	}
	const full = path.join(root, ...segments);
	if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('경로가 올바르지 않아요.');
	return full;
}

export class ObjectStore {
	constructor(private readonly root: string) {}

	async put(bucket: string, key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
		const full = resolvePath(this.root, bucket, key);
		await mkdir(path.dirname(full), { recursive: true });
		await writeFile(full, bytes);
		return this.meta(bucket, key, bytes.length, contentType);
	}

	async get(bucket: string, key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
		const full = resolvePath(this.root, bucket, key);
		try {
			const bytes = await readFile(full);
			return { bytes, contentType: await readContentType(full) };
		} catch {
			return null;
		}
	}

	async delete(bucket: string, key: string): Promise<boolean> {
		const full = resolvePath(this.root, bucket, key);
		try {
			await stat(full);
		} catch {
			return false;
		}
		await rm(full, { force: true });
		return true;
	}

	async list(bucket: string, prefix: string): Promise<StoredObject[]> {
		const base = resolvePath(this.root, bucket, '');
		const out: StoredObject[] = [];
		const walk = async (dir: string, rel: string): Promise<void> => {
			let entries;
			try {
				entries = await readdir(dir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const entryRel = rel ? `${rel}/${entry.name}` : entry.name;
				if (entry.isDirectory()) await walk(path.join(dir, entry.name), entryRel);
				else if (!prefix || entryRel.startsWith(prefix)) {
					const st = await stat(path.join(dir, entry.name));
					out.push(this.meta(bucket, entryRel, st.size, await readContentType(path.join(dir, entry.name))));
				}
			}
		};
		await walk(base, '');
		return out.sort((a, b) => a.key.localeCompare(b.key));
	}

	private meta(bucket: string, key: string, size: number, contentType: string): StoredObject {
		return {
			key,
			size,
			contentType,
			lastModified: new Date().toISOString(),
			etag: createHash('sha256').update(`${bucket}/${key}:${size}`).digest('hex').slice(0, 32)
		};
	}
}

/** 저장된 파일의 Content-Type — 확장자 매핑 (업로드 시 검증된 mime만 들어와요) */
async function readContentType(full: string): Promise<string> {
	const ext = path.extname(full).slice(1);
	return (
		{ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] ?? 'application/octet-stream'
	);
}
```
위 `list`의 `this.meta`는 `lastModified`를 실제 mtime으로 채우도록 `meta`에 파라미터를 더하거나, 목록에서 `stat` 결과를 쓰도록 조정한다 (계획의 골자는 유지, 실행 시 mtime 반영).

**Step 4: PUT 라우트 (실패 테스트 먼저)**

```ts
// apps/storage/src/routes/objects.put.test.ts
import Fastify from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { requireAuth } from '../plugins/auth.ts';
import { ObjectStore } from '../services/objectStore.ts';
import { registerObjectRoutes } from './objects.ts';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

let dir: string;
let fastify: ReturnType<typeof Fastify>;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), 'storage-'));
	fastify = Fastify();
	await registerObjectRoutes(fastify, { store: new ObjectStore(dir), guard: requireAuth('key'), publicUrl: 'https://cdn.example.com' });
});
afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
	await fastify.close();
});

describe('PUT /:bucket/*', () => {
	it('업로드하면 201과 공개 URL을 줘요', async () => {
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/a.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: PNG
		});
		expect(res.statusCode).toBe(201);
		expect(res.json()).toMatchObject({ bucket: 'guild-assets', key: 'g1/a.png', contentType: 'image/png', url: 'https://cdn.example.com/guild-assets/g1/a.png' });
	});

	it('매직 바이트와 확장자가 안 맞으면 400이에요', async () => {
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/a.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: new Uint8Array([1, 2, 3])
		});
		expect(res.statusCode).toBe(400);
	});

	it('인증 없으면 401, 키가 틀리면 401이에요', async () => {
		const res = await fastify.inject({ method: 'PUT', url: '/guild-assets/g1/a.png', payload: PNG });
		expect(res.statusCode).toBe(401);
	});

	it('크기 상한을 넘으면 413이에요', async () => {
		const big = new Uint8Array(9 * 1024 * 1024);
		big.set(PNG, 0);
		const res = await fastify.inject({
			method: 'PUT',
			url: '/guild-assets/g1/big.png',
			headers: { authorization: 'key', 'content-type': 'image/png' },
			payload: big
		});
		expect(res.statusCode).toBe(413);
	});
});
```

**Step 5: `objects.ts` PUT 구현**

```ts
// apps/storage/src/routes/objects.ts (핵심)
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ASSET_ALLOWED_MIME_TYPES, ASSET_MAX_BYTES, sniffImageMime } from '@sirubot/utils';
import type { ObjectStore } from '../services/objectStore.ts';

interface ObjectRouteOptions {
	store: ObjectStore;
	guard: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
	publicUrl: string;
}

export async function registerObjectRoutes(fastify: FastifyInstance, options: ObjectRouteOptions): Promise<void> {
	const { store, guard, publicUrl } = options;

	// 업로드 — body를 원시 바이트로 받아요 (Fastify 기본 body 파서가 비활성인 상태)
	fastify.put<{ Params: { bucket: string; '*': string } }>(
		'/:bucket/*',
		{ preHandler: guard, bodyLimit: ASSET_MAX_BYTES },
		async (request, reply) => {
			const bucket = request.params.bucket;
			const key = request.params['*'];
			const body = request.body;
			if (!Buffer.isBuffer(body)) return reply.code(400).send({ error: '파일 본문이 필요해요.' });
			const bytes = new Uint8Array(body);
			if (bytes.length === 0) return reply.code(400).send({ error: '빈 파일은 올릴 수 없어요.' });
			if (bytes.length > ASSET_MAX_BYTES) return reply.code(413).send({ error: '이미지가 너무 커요. 최대 8MB까지 올릴 수 있어요.' });

			const mime = sniffImageMime(bytes);
			if (!mime || !ASSET_ALLOWED_MIME_TYPES.has(mime)) {
				return reply.code(400).send({ error: 'PNG, JPEG, WebP, GIF 이미지만 지원해요.' });
			}
			// 확장자와 실제 형식 일치 여부는 parseAssetKey 수준에서 검증 (Task 1의 규약)
			const saved = await store.put(bucket, key, bytes, mime).catch(() => null);
			if (!saved) return reply.code(400).send({ error: '경로가 올바르지 않아요.' });
			return reply.code(201).send({ bucket, key: saved.key, size: saved.size, contentType: mime, etag: saved.etag, url: `${publicUrl.replace(/\/+$/, '')}/${bucket}/${saved.key}` });
		}
	);
}
```
실행 시 보완할 것: `Buffer.isBuffer(body)` 검사는 Fastify에서 원시 바이트를 받도록 `fastify.addContentTypeParser('*', { parseAs: 'buffer' }, ...)`를 `server.ts`에 등록하는 것으로 해결한다 (본문 파서 등록이 PUT 테스트의 첫 실패 사유가 될 거예요).

**Step 6: server.ts에 라우트 등록 + 전체 테스트·커밋**

```bash
cd apps/storage && npx vitest run && npx tsc --noEmit
git add apps/storage
git commit -m "feat(storage): 오브젝트 저장소 + PUT 업로드 (매직 바이트 검증·크기 상한)"
```

---

## Task 4: 공개 GET 오브젝트

**Files:**
- Modify: `apps/storage/src/routes/objects.ts` (GET 추가)
- Create: `apps/storage/src/routes/objects.get.test.ts`

핵심 동작 (테스트에 명시):
- `GET /:bucket/*key` 인증 없이 200, `Content-Type`은 저장된 mime, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`, `Cache-Control: public, max-age=31536000, immutable`
- 없으면 404 JSON `{ error: '이미지를 찾을 수 없어요.' }`
- 경로 탈출 키는 400

```ts
// 구현 (objects.ts에 추가)
fastify.get<{ Params: { bucket: string; '*': string } }>('/:bucket/*', async (request, reply) => {
	const got = await store.get(request.params.bucket, request.params['*']).catch(() => null);
	if (!got) return reply.code(404).send({ error: '이미지를 찾을 수 없어요.' });
	return reply
		.header('content-type', got.contentType)
		.header('x-content-type-options', 'nosniff')
		.header('content-disposition', 'inline')
		.header('cache-control', 'public, max-age=31536000, immutable')
		.send(Buffer.from(got.bytes));
});
```

**검증·커밋:**
```bash
cd apps/storage && npx vitest run && npx tsc --noEmit
git add apps/storage
git commit -m "feat(storage): 공개 GET 오브젝트 (immutable 캐시·nosniff·inline)"
```

---

## Task 5: LIST + DELETE

**Files:**
- Modify: `apps/storage/src/routes/objects.ts`
- Create: `apps/storage/src/routes/objects.list-delete.test.ts`

핵심 동작:
- `GET /:bucket?prefix=g1/&max-keys=100` (preHandler guard) → S3 스타일 JSON:
  `{ contents: [{ key, size, lastModified, etag, contentType }], isTruncated: false, prefix }`
- `DELETE /:bucket/*key` (preHandler guard) → 성공 204, 없으면 404
- prefix에 `..`가 있으면 400

**검증·커밋:**
```bash
cd apps/storage && npx vitest run && npx tsc --noEmit
git add apps/storage
git commit -m "feat(storage): LIST(prefix)·DELETE 오퍼레이션"
```

---

## Task 6: Prisma `GuildAsset` 모델

**Files:**
- Modify: `packages/prisma/src/schema.prisma`

```prisma
/// 길드 이미지 에셋 — 스토리지(apps/storage)에 올린 파일의 메타데이터. 커스텀 명령어 썸네일·갤러리가 URL로 참조해요.
model GuildAsset {
  id         String   @id @default(uuid())
  guildId    String
  bucket     String
  key        String
  name       String
  mimeType   String
  sizeBytes  Int
  /// 공개 GET URL — 스토리지가 돌려준 URL을 그대로 저장해요
  url        String
  createdBy  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  guild      Guild    @relation(fields: [guildId], references: [id], onDelete: Cascade)

  @@unique([bucket, key])
  @@index([guildId, createdAt(sort: Desc)])
}
```

`model Guild`의 관계 필드 목록(`history`, `customCommands` 옆)에 `assets GuildAsset[]` 추가.

**검증·커밋:**
```bash
yarn workspace @sirubot/prisma migrate:dev --name guild-assets
yarn generate
git add packages/prisma
git commit -m "feat(prisma): GuildAsset 모델 (길드 이미지 에셋 메타데이터)"
```

---

## Task 7: 대시보드 스토리지 클라이언트

**Files:**
- Create: `apps/dashboard/src/lib/storage.ts`

계약 (data-api 클라이언트와 동일한 규율):
- env: `STORAGE_URL`(기본 `http://localhost:3003`), `STORAGE_AUTH_KEY ?? AUTH_KEY`. 키가 없으면 호출 전면 스킵하고 명확한 한국어 에러를 남겨요 (502 응답용 메시지).
- 타임아웃 15초 (`AbortSignal.timeout`), 실패 시 스토리지 응답의 한국어 메시지를 그대로 전달.

```ts
// src/lib/storage.ts 핵심 시그니처
export interface PutAssetResult {
  bucket: string;
  key: string;
  url: string;
  size: number;
  contentType: string;
}

/** 업로드 (원시 바이트 PUT). 실패하면 한국어 사유를 throw */
export async function putAssetObject(key: string, bytes: Uint8Array): Promise<PutAssetResult>;

/** 삭제 — 404는 성공으로 취급 (이미 없는 파일) */
export async function deleteAssetObject(bucket: string, key: string): Promise<void>;

/** 스토리지가 설정됐는지 (키 없으면 false — 라우트에서 502 안내에 써요) */
export function isStorageConfigured(): boolean;
```

**검증·커밋:**
```bash
yarn workspace @sirubot/dashboard lint && yarn workspace @sirubot/dashboard typecheck
git add apps/dashboard/src/lib/storage.ts
git commit -m "feat(dashboard): 스토리지 클라이언트 (AUTH_KEY 폴백·타임아웃 계약)"
```

---

## Task 8: 에셋 API 라우트

**Files:**
- Modify: `apps/dashboard/src/lib/rate-limit.ts` (`UPLOAD_RATE` 추가: `{ limit: 10, windowMs: 60_000 }`)
- Create: `apps/dashboard/src/app/api/servers/[id]/assets/route.ts` (GET 목록, POST 업로드)
- Create: `apps/dashboard/src/app/api/servers/[id]/assets/[assetId]/route.ts` (PATCH 이름, DELETE)

**POST /api/servers/[id]/assets** 흐름 (greeting-image.ts 선례를 따라):
1. `authorizeGuildManage` → `guardRateLimit(rateKey("asset-upload", userId, guildId), UPLOAD_RATE)`
2. `request.formData()` → `file` 검증 (0 < size <= ASSET_MAX_BYTES, mime 화이트리스트)
3. `sniffImageMime`으로 실제 형식 재검증 (클라이언트가 보낸 `file.type` 신뢰 금지)
4. `assetKeyFor(guildId, crypto.randomUUID(), mime)`로 키 생성 → `putAssetObject`
5. 이름은 원본 파일명 기반(경로 제거·60자 이하, 비면 '이미지') → `GuildAsset` insert
6. 201 `{ asset }`

**DELETE** 흐름:
1. 인증 + WRITE_RATE
2. DB에서 조회 후, `CustomCommand.spec` JSON에 `asset.url`이 포함된 명령어 이름을 조회해 `referencedBy`로 반환 (경고용, 삭제는 진행)
3. `deleteAssetObject` (404 무시) → DB delete → `{ ok: true, referencedBy: string[] }`

**검증·커밋:**
```bash
yarn workspace @sirubot/dashboard lint && yarn workspace @sirubot/dashboard typecheck
git add apps/dashboard/src
git commit -m "feat(dashboard): 길드 에셋 API (업로드·목록·이름 변경·삭제 + 참조 경고)"
```

---

## Task 9: 에셋 훅 + 관리 패널 + 탭 등록

**Files:**
- Create: `apps/dashboard/src/hooks/use-guild-assets.ts` (SWR 목록 + upload/rename/remove 액션)
- Create: `apps/dashboard/src/components/servers/assets-settings.tsx`
- Modify: `apps/dashboard/src/components/servers/server-dashboard.tsx` (TABS에 `{ key: "assets", label: "에셋", icon: <Images size={14} /> }` + 렌더 분기)

UI 구성 (ui-primitives 스킬의 컴포넌트만 사용):
- `PanelHeader` "이미지 에셋" + 업로드 버튼(여러 장, `accept="image/png,image/jpeg,image/webp,image/gif"`)
- 카드 그리드: 썸네일(`<img>`는 임의 URL이라 `next/image` 미사용, eslint-disable 주석은 designer 선례 따름), 이름(더블클릭 인라인 수정 또는 수정 버튼), 용량·등록일, URL 복사, 삭제(2단계 확인은 custom-commands-settings의 4초 타이머 패턴 재사용)
- 상태: 로딩(`PanelLoading`), 에러(`PanelError`), 빈 상태(`EmptyState`), 업로드 중 비활성

**검증·커밋:**
```bash
yarn workspace @sirubot/dashboard lint && yarn workspace @sirubot/dashboard typecheck && yarn workspace @sirubot/dashboard build
git add apps/dashboard/src
git commit -m "feat(dashboard): 길드 에셋 관리 패널 (업로드·이름 변경·삭제·URL 복사)"
```

---

## Task 10: 에셋 피커 + 커스텀 명령어 빌더 연동

**Files:**
- Create: `apps/dashboard/src/components/servers/asset-picker.tsx`
- Modify: `apps/dashboard/src/components/servers/custom-command-designer.tsx` (props에 `guildId` 추가, 섹션 썸네일·미디어 갤러리에 "업로드"/"에셋에서 선택" 버튼)
- Modify: `apps/dashboard/src/components/servers/custom-command-editor.tsx` (designer에 `guildId` 전달)

동작:
- "에셋에서 선택" → `AssetPicker` 다이얼로그(에셋 그리드, 단일 선택은 썸네일용/다중 선택은 갤러리용) → URL 필드에 채움
- "업로드" → 숨김 `<input type="file">` → POST assets → 완료 시 해당 URL을 필드에 채움 (등록도 함께 되므로 피커에 바로 나타남)
- 기존 URL 직접 입력 필드는 유지 (외부 URL 허용)

**검증·커밋:**
```bash
yarn workspace @sirubot/dashboard lint && yarn workspace @sirubot/dashboard typecheck && yarn workspace @sirubot/dashboard build
git add apps/dashboard/src
git commit -m "feat(dashboard): 커스텀 명령어 빌더에 에셋 업로드·선택 연결"
```

---

## Task 11: Docker·환경변수 문서

**Files:**
- Modify: `Dockerfile` (`builder-storage`, `storage` target — data-api target를 복사해 워크스페이스 필터만 변경)
- Modify: `docker/docker-compose.yml`, `docker/docker-stack.yml` (storage 서비스 + `storage-data:/data` 볼륨 + `STORAGE_PUBLIC_URL` env)
- Create: `apps/storage/.env.example`
- Modify: `AGENTS.md` env 섹션에 스토리지 계약 한두 줄 추가

예시 (compose):
```yaml
  storage:
    image: sirubot/storage:latest
    build:
      context: ..
      dockerfile: Dockerfile
      target: storage
    ports:
      - "3003:3003"
    env_file:
      - .env
    environment:
      - STORAGE_DATA_DIR=/data
      - STORAGE_PUBLIC_URL=https://cdn.example.com   # 실제 공개 도메인으로 교체
    volumes:
      - storage-data:/data
    restart: unless-stopped
    networks:
      - sirubot-network
```

**검증·커밋:**
```bash
docker build --target storage .  (가능한 환경에서)
git add Dockerfile docker apps/storage/.env.example AGENTS.md
git commit -m "feat(storage): docker 타겟·compose 서비스·env 문서"
```

---

## Task 12: 전체 검증 + 라운드트립

**Step 1: 전체 파이프라인**
```bash
yarn lint && yarn typecheck && yarn test
```

**Step 2: curl 라운드트립 (로컬에서 storage만 띄우고)**
```bash
yarn workspace @sirubot/storage dev   # 또는 node dist + env
curl -X PUT -H "Authorization: $AUTH_KEY" --data-binary @test.png http://localhost:3003/guild-assets/123/abc.png
curl -i http://localhost:3003/guild-assets/123/abc.png          # 200 + immutable 캐시 확인
curl -H "Authorization: $AUTH_KEY" "http://localhost:3003/guild-assets?prefix=123/"
curl -X DELETE -H "Authorization: $AUTH_KEY" http://localhost:3003/guild-assets/123/abc.png
```

**Step 3: 수동 확인 체크리스트 (배포/프리뷰에서)**
- [ ] 에셋 패널에서 업로드 → 썸네일 표시, 이름 변경, URL 복사
- [ ] 커스텀 명령어 빌더에서 "에셋에서 선택"으로 썸네일 채우기, 갤러리에 여러 장 추가
- [ ] 명령어를 디스코드에서 실행 → 이미지가 임베드로 보임 (디스코드 프록시가 CDN에서 fetch)
- [ ] 에셋 삭제 시 참조 경고가 뜨는 명령어 이름이 맞는지
- [ ] 라이트/다크 테마, 모바일(에셋 그리드·업로드 버튼 44px) 확인

**커밋:**
```bash
git add -A
git commit -m "test: 에셋·스토리지 전체 검증 정리"
```

---

## 남은 판단 사항 (실행 중 결정)

1. **원시 body 파서**: Fastify PUT에서 바이너리를 받으려면 `addContentTypeParser('*')` 등록이 필요해요. Task 3에서 테스트가 실패하는 첫 사유가 될 거예요.
2. **auth 적용 범위**: 공개 GET이 인증 훅에 걸리지 않도록 `requireAuth` preHandler를 보호 라우트에만 붙이는 형태로 확정 (Task 2 주의사항).
3. **에셋 삭제 시 참조**: 명령어 spec의 URL 문자열 스캔은 LIKE 기반이라 대용량에서 느릴 수 있어요. 길드당 에셋·명령어 상한이 작아 현재는 괜찮고, 나중에 참조 카운트 컬럼으로 개선 가능.
4. **STORAGE_PUBLIC_URL 변경 시**: URL 컬럼이 스냅샷이라, 공개 도메인이 바뀌면 재마이그레이션(일괄 치환)이 필요해요. 문서에 남길 것.
