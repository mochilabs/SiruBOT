# storage agent instructions (`apps/storage`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `apps/storage/src/` unless they start with `apps/` or `packages/`.

## Layout

- A small object store: `routes/objects.ts` (PUT, GET, list, delete) over `services/objectStore.ts`, which writes files under `STORAGE_DATA_DIR`. Public GETs are what Discord fetches for embeds. Writes, lists and deletes need the key.
- Route tests are split per verb (`routes/objects.{put,get,list-delete}.test.ts`). Add a case to the matching file.

## Env

- Env schema: `config/env.ts`. The auth key is `STORAGE_AUTH_KEY ?? AUTH_KEY`. Startup fails closed without one (`config/env.test.ts`).
- `STORAGE_PUBLIC_URL` (a public https domain) is baked into every issued URL. Changing the domain means rewriting URLs already stored in the database.
- `STORAGE_DATA_DIR` (default `./data`, `/data` in Docker) must be a persisted volume.
- Two callers hold the URL and key. Dashboard API routes upload and delete guild image assets through `apps/dashboard/src/lib/storage.ts`. data-api relays private objects such as ticket transcripts. The bot never gets either.
