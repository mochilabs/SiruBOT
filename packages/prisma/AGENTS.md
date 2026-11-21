# prisma agent instructions (`packages/prisma`)

Repo-wide rules live in the root `AGENTS.md`. Paths are relative to `packages/prisma/`. More conventions are in the `repo-infra` skill.

- One PostgreSQL schema for bot, dashboard, data-api and notifier: `src/schema.prisma`, migrations in `src/migrations/`. Each app builds its own client with the PrismaPg adapter (`docs/architecture.md` §8 lists the models and their writers).
- `yarn generate` (root) must run before any typecheck or build, and again after every schema change.
- Schema change: edit `src/schema.prisma`, then `yarn workspace @sirubot/prisma migrate:dev` to create and apply a migration. Commit the migration folder with the schema. `prisma.config.ts` loads `DATABASE_URL` through `dotenv/config`, so these commands read `packages/prisma/.env` (gitignored).
- Deploy: the bot image runs `prisma migrate deploy` on start. On `beta` (`GIT_BRANCH=beta`) it also runs `prisma db push --accept-data-loss` (`Dockerfile`), so a schema change without a migration reaches beta but **not** release images. Always ship a migration.
- Lint covers only `prisma.config.ts` (prettier). There are no tests.
