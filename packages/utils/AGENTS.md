# utils agent instructions (`packages/utils`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `packages/utils/src/`.

- Every cross-app contract (Redis channels, payload schemas, guild settings, custom commands) is defined here once. Apps only import it.
- The root barrel (`index.ts`) includes node-only modules, so it is for **server apps only**. The dashboard imports subpaths only, which eslint enforces. A module the dashboard needs must be a subpath.
- Adding or removing a subpath means editing both `package.json` `exports` and the `entry` list in `tsup.config.ts`. Missing either one breaks `dist/*.d.ts` or the import.
- Redis channel names live only in `redisChannels.ts` and are bundled as contracts in `redisContract.ts` (`defineRedisRpc`, `defineRedisEvent`, `defineRedisGuildEvent`). Wire strings must stay byte-identical across a rolling deploy, and `redisContract.test.ts` pins them. Signing and envelopes: `redisEnvelope.ts`.
- The logger settings (`getLoggerSettings` in `logger.ts`) are mirrored by hand in `packages/app-kit/src/logger.ts`. Change both together.
- Tests import this package from **source** through the root `vitest.config.ts` alias. Apps' typecheck and build use `dist`, so run `yarn typecheck` (which builds dependencies) after changing an export.
- `modules.ts` is the bot module table (help categories, usage-metric keys, later per-guild module toggles). The bot's `discord/help/helpCatalog.test.ts` checks it against the real command pieces, so adding a slash command means adding it to a module here.
