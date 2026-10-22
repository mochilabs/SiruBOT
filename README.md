<h1 align="center">
SiruBOT

[![Latest Version](https://img.shields.io/github/v/release/mochiLabs/SiruBOT?label=latest%20version)](https://github.com/mochiLabs/SiruBOT/releases)
![Node version](https://img.shields.io/badge/node-%3E%3D22.0-brightgreen)
![GitHub](https://img.shields.io/github/license/mochiLabs/SiruBOT)
[![Run lint](https://github.com/mochilabs/SiruBOT/actions/workflows/lint.yml/badge.svg)](https://github.com/mochilabs/SiruBOT/actions/workflows/lint.yml)
[![Publish Docker Image](https://github.com/mochilabs/SiruBOT/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/mochilabs/SiruBOT/actions/workflows/docker-publish.yml)

</h1>

<p align="center">
  <b>English</b> | <a href="README.ko.md">한국어</a>
</p>

A Discord music bot built with Discord.js and Lavalink. The repository also contains a Next.js dashboard, a data API, a shard manager, a storage service, and a notifier service, organized as a Yarn workspaces monorepo.

---

## 🏗️ Project Structure

```
sirubot/
├── apps/
│   ├── bot/           # Discord bot application
│   ├── dashboard/     # Next.js web dashboard
│   ├── data-api/      # External data gateway (cache + LLM batch jobs)
│   ├── notifier/      # Social alert service (webhooks + live-stream schedulers)
│   ├── shardmanager/  # Shard management server
│   └── storage/       # Object storage service (generated images and assets)
└── packages/
    ├── app-kit/       # Shared Fastify helpers (auth, env validation, logger)
    ├── prisma/        # Database schema and client
    ├── shardclient/   # Shard client library
    └── utils/         # Shared utility functions and modules
```

---

## 🎵 Core Features

- **Music playback**: Audio playback through Lavalink.
- **Web Dashboard**: Music controls, server settings, and shard status monitoring.
- **Data API Gateway**: Caches external API calls (weather, lyrics, horoscopes, delivery tracking, YouTube chapters) and runs scheduled LLM jobs for the bot services.
- **Profile Card**: A rendered image card for user profiles with a zodiac constellation background, banner, avatar, and music stats.
- **Custom Playlists**: Create, manage, and load personalized music playlists directly from the bot or dashboard.
- **Smart Auto-complete**: Real-time track search suggestions inside Discord slash commands.
- **Queue Controls**: Music queue controls including looping, shuffling, skipping, and navigating directly to specific tracks.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22 or higher
- **Yarn**: v4.12.0 (managed with Corepack)
- **Database**: PostgreSQL (connected via Prisma ORM)
- A Discord Bot Token and an active Lavalink server instance

### Environment Setup (`.env`)

Create an `.env` file in each app directory from its `.env.example`. The examples below show the minimum local setup. Keep secrets out of version control.

#### 1. Discord Bot (`apps/bot/.env`)
```env
DISCORD_TOKEN=your_discord_bot_token_here
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot
REDIS_URL=redis://localhost:6379
LAVALINK_HOSTS=main_localhost_2333_youshallnotpass
# Optional: enable bot features served by the data API
DATA_API_URL=http://localhost:3002
DATA_API_AUTH_KEY=replace_with_data_api_key
# Required for production shard-manager connection. Omit for standalone local development.
# SHARD_MANAGER_URL=ws://localhost:3001/ws
# AUTH_KEY=replace_with_a_shared_secret
```

#### 2. Web Dashboard (`apps/dashboard/.env`)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
DISCORD_CLIENT_ID=your_discord_application_client_id
DISCORD_CLIENT_SECRET=your_discord_application_client_secret
AUTH_SECRET=generate_a_random_secret
NEXT_PUBLIC_APP_URL=http://localhost:3000
# Keep these keys and URLs aligned with the corresponding services.
SHARD_MANAGER_URL=http://localhost:3001
SHARD_MANAGER_AUTH_KEY=replace_with_shard_manager_key
DATA_API_URL=http://localhost:3002
DATA_API_AUTH_KEY=replace_with_data_api_key
```

#### 3. Data API (`apps/data-api/.env`)
```env
# Required: data-api refuses to start without one of these shared authentication keys.
DATA_API_AUTH_KEY=replace_with_data_api_key
# Or use AUTH_KEY instead. The bot and dashboard must send the same key.
# AUTH_KEY=replace_with_data_api_key
# Optional shared cache and request hub (in-memory fallback when unset)
REDIS_URL=redis://localhost:6379
# Optional translation provider for horoscope translation and memory tidy jobs
OPENAI_COMPATIBLE_API_URL=http://127.0.0.1:8080/v1
OPENAI_API_KEY=your_api_key_here
TRANSLATION_MODEL=your_model_name
# Optional: memory tidy requires DATABASE_URL and a configured translation provider
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
```

The bot requires `DATA_API_URL` in `apps/bot/.env` for gateway-backed features; without it those calls fail with an error. The dashboard defaults to `http://localhost:3002`. Set `DATA_API_AUTH_KEY` or `AUTH_KEY` to the same value in the data API, bot, and dashboard environments. Requests send the key as the raw `Authorization` header value, without a `Bearer` prefix. Only `/api/health` is unauthenticated.

---

### Data API Gateway

The gateway centralizes external API access so bot shards never call third-party services directly. All read endpoints are authenticated (except `/api/health`), share one Redis-backed cache with per-route TTLs, coalesce concurrent identical requests into a single upstream call, and are protected by per-provider circuit breakers.

| Endpoint | Method | Description | Cache TTL |
|---|---|---|---|
| `/v1/ohaasa` | GET | Daily horoscope (Asahi Ohaasa / TV Asahi), LLM-translated to Korean | 7 days |
| `/v1/lyrics?q=` | GET | Lyrics search (lrclib.net) | 30 days |
| `/v1/weather?location=&scope=` | GET | Geocoding + forecast + air quality (Open-Meteo) | 15 min |
| `/v1/chapters?videoId=&durationMs=` | GET | YouTube chapter markers for long videos | 12 h |
| `/v1/delivery/track?carrier=&number=` | GET | Parcel tracking (tracker.delivery), carrier alias resolution server-side | 5 min |
| `/v1/playback/events` | POST | Playback event ingestion from bot shards (start/end/stuck/error/abort) | N/A |
| `/v1/playback/recent?limit=` | GET | Recent playback events, including errors | N/A |
| `/v1/image/profile` | POST | Renders a profile card PNG (zodiac background, banner, avatar, stats) | N/A |
| `/v1/ohaasa/refresh` | POST | Force-refresh the daily horoscope | N/A |
| `/v1/status` | GET | Operational metrics (cache hit rate, upstream calls/errors, breakers) | N/A |
| `/dashboard` | GET | Built-in monitoring dashboard (no third-party dependencies) | N/A |

Background jobs (single instance, jittered schedule):
- **Horoscope translation**: daily at KST 06:50. It keeps Redis warm so shard requests do not need to call the LLM.
- **Memory tidy (nightly pass)**: daily at midnight, compacts per-user long-term memory via LLM. It runs only when both `DATABASE_URL` and the translation provider are configured.

The gateway listens on port `3002` by default. The bot and the dashboard reach external providers only through the gateway; the gateway owns all provider integrations.

```bash
# Build dependencies, then run the data API
yarn generate
yarn workspace @sirubot/data-api build
yarn workspace @sirubot/data-api start
```

---

## 🛠️ Development & Building

Manage the entire monorepo from the root directory using the scripts below:

```bash
# Install dependencies
yarn install

# Generate Prisma client files
yarn generate

# Start the dashboard dev server (the only workspace with a dev script)
yarn dev

# Rebuild the backend apps and shared packages on change (watch mode)
yarn watch

# Apply database migrations in development
yarn workspace @sirubot/prisma migrate:dev

# Lint the repository
yarn lint

# Run tests
yarn test

# Build all packages and applications for production
yarn build
```

For local development, create the per-app environment files described above. Then run `yarn dev` for the dashboard, and run `yarn watch` for the backend apps (bot, data-api, notifier, storage, shardmanager) — it rebuilds them on change but does not start them. Start a backend app in a second terminal with `yarn workspace @sirubot/<name> start`. Generate the Prisma client with `yarn generate` before typechecking or building.

### Filtering Specific Projects (Turbo Filter)

To build or run dev servers for single projects rather than the entire monorepo, utilize Turbo's filtering syntax:

```bash
# Start the dashboard dev server
turbo dev --filter=@sirubot/dashboard

# Rebuild the bot on change (backend apps have no dev script, they use watch)
turbo run watch --filter=@sirubot/bot

# Build the shared utils package
turbo build --filter=@sirubot/utils
```

---

## 🐳 Docker Deployment Guide

The root Dockerfile builds separate images for the bot, dashboard, shard manager, data API, storage, and notifier. Select a target with `--target` and provide that service's environment variables at runtime. The checked-in Compose file is a partial example: the application services and Redis/PostgreSQL services are commented out.

```bash
# Build the bot image
docker build --target bot -t sirubot-bot:latest .

# Other targets: dashboard, shardmanager, data-api, storage, notifier
```

Configure PostgreSQL, Redis, Lavalink, and the required service credentials before starting the containers. The bot image runs Prisma migrations on startup.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
