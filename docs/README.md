# SiruBOT documentation

> **As of**: 2026-11-13

## Documents

| Document | Covers |
|---|---|
| `README.md` (this file) | Index, who owns what, writing rules |
| `architecture.md` | The reference: system context, per-app details, shared contracts, boot and shutdown, environment variables |
| `setup-dev.md` | Local setup: install, env files, running apps, ports, verification commands |
| `runbook-production.md` | Operations: Docker builds, shard incidents, shutdown order, health checks |
| `api-data-api.md` | data-api HTTP contract: auth, endpoints, cache TTLs, error mapping, schedulers |
| `api-dashboard.md` | Dashboard API routes: layers, route groups, roles, rate limits, validation |
| `3rdparty.md` | Third-party contracts: Lavalink plugins, client libraries, external HTTP services, update playbook |
| `pr-message-rule.md` | Pull request title and body rules, including how to record verification |

## Who owns what

| Place | Role |
|---|---|
| `AGENTS.md` (repo root) and `apps/bot/AGENTS.md` | Coding rules for agents and contributors: branches, commands, cross-app rules, bot conventions |
| `.pi/skills/<id>/SKILL.md` | Task playbooks, loaded before working in that area. `AGENTS.md` lists the ids |
| `docs/*` | Structure, contracts and operations: what lives where and how it is called. Only documents linked from the root `README.md` live here |
| `Localdocs/` (gitignored) | Working notes: plans, audits, rollout notes, branch changelogs. Never committed |

A rule belongs in exactly one of these. Link to it from the others instead of copying it.

## Writing rules

1. **Code wins.** When a contract changes, update the code and the document in the same change.
2. **Cite file paths, never line numbers.** Line numbers drift as soon as the code changes (`apps/data-api/src/routes/index.ts`, not a line anchor).
3. **No duplication.** If `architecture.md` already says it, link to the section.
4. **English only**, with identifiers, paths, commands and error codes kept verbatim.
5. **Never write secret values.** Name the variable and point to the app's `.env.example`.
