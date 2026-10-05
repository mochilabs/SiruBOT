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

A modern Discord music bot built with Discord.js and Lavalink, featuring a highly-scalable monorepo architecture powered by Turbo and Yarn workspaces.

---

## 🏗️ Project Structure

```
sirubot/
├── apps/
│   ├── bot/           # Discord bot application
│   ├── dashboard/     # Next.js web dashboard
│   ├── data-api/      # External data gateway (cache + LLM batch jobs)
│   └── shardmanager/  # Shard management server
└── packages/
    ├── prisma/        # Database schema and client
    ├── shardclient/   # Shard client library
    └── utils/         # Shared utility functions and modules
```

---

## 🎵 Core Features

- **High-Quality Audio streaming**: Ultra-low latency music playback streamed seamlessly via Lavalink.
- **Web Dashboard**: An immersive, real-time web control panel providing interactive music controls and shard status monitoring.
- **Data API Gateway**: A centralized gateway that caches external API calls (weather, lyrics, horoscopes, delivery tracking, YouTube chapters) and runs scheduled LLM jobs — one shared instance instead of per-shard duplicate requests.
- **Profile Card**: A rendered image card for user profiles — zodiac constellation background, user banner, avatar and music stats.
- **Custom Playlists**: Create, manage, and load personalized music playlists directly from the bot or dashboard.
- **Smart Auto-complete**: Real-time track search suggestions inside Discord slash commands.
- **Advanced Queue Controls**: Refined music queue controls including looping, shuffling, skipping, and navigating directly to specific tracks.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22 or higher
- **Yarn**: v4.6.0 or higher (with Corepack enabled)
- **Database**: PostgreSQL (connected via Prisma ORM)
- A Discord Bot Token and an active Lavalink server instance

### Environment Setup (`.env`)

To run the applications, configure the environment variables in `.env` files within their respective application directories.

#### 1. Discord Bot (`apps/bot/.env`)
```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
LAVALINK_URL=localhost:2333
LAVALINK_PASSWORD=youshallnotpass
```

#### 2. Web Dashboard (`apps/dashboard/.env`)
```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
```

#### 3. Data API (`apps/data-api/.env`)
```env
# Shared cache (falls back to in-memory when unset)
REDIS_URL=redis://localhost:6379
# Auth key — must match the bot's AUTH_KEY
AUTH_KEY=shared_secret_here
# Optional: translation provider for horoscope + memory tidy batch job
OPENAI_COMPATIBLE_API_URL=http://127.0.0.1:8080/v1
OPENAI_API_KEY=your_api_key_here
TRANSLATION_MODEL=your_model_name
# Optional: enables the nightly memory tidy batch job
DATABASE_URL=postgresql://user:password@localhost:5432/sirubot?schema=public
# Optional: point the bot at this gateway (set in apps/bot/.env instead)
# DATA_API_URL=http://localhost:3002
```

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
| `/v1/playback/events` | POST | Playback event ingestion from bot shards (start/end/stuck/error/abort) | — |
| `/v1/playback/recent?limit=` | GET | Recent playback events, including errors | — |
| `/v1/image/profile` | POST | Renders a profile card PNG (zodiac background, banner, avatar, stats) | — |
| `/v1/ohaasa/refresh` | POST | Force-refresh the daily horoscope | — |
| `/v1/status` | GET | Operational metrics (cache hit rate, upstream calls/errors, breakers) | — |
| `/dashboard` | GET | Built-in monitoring dashboard (no third-party dependencies) | — |

Background jobs (single instance, jittered schedule):
- **Horoscope translation** — daily at KST 06:50, keeps Redis warm so shard requests never hit the LLM.
- **Memory tidy (nightly pass)** — daily at midnight, compacts per-user long-term memory via LLM. Only active when both `DATABASE_URL` and the translation provider are configured.

Running the bot with `DATA_API_URL` set makes it consume the gateway exclusively; unset, the bot falls back to direct calls, so dev environments work without the gateway.

```bash
# Run in development
yarn dev --filter=@sirubot/data-api   # or: turbo dev --filter=@sirubot/data-api
```

---

## 🛠️ Development & Building

Manage the entire monorepo from the root directory using the scripts below:

```bash
# Install dependencies
yarn install

# Run all apps in development mode concurrently
yarn dev

# Generate Prisma client files
yarn generate

# Run Prisma database migrations
yarn workspace @sirubot/prisma migrate:dev

# Build all packages and applications for production
yarn build

# Lint and format code across the repository
yarn lint
```

### Filtering Specific Projects (Turbo Filter)

To build or run dev servers for single projects rather than the entire monorepo, utilize Turbo's filtering syntax:

```bash
# Start bot in development mode
turbo dev --filter=@sirubot/bot

# Start dashboard in development mode
turbo dev --filter=@sirubot/dashboard

# Build the shared utils package
turbo build --filter=@sirubot/utils
```

---

## 🐳 Docker Deployment Guide

Container configurations are provided to easily deploy the entire stack.

```bash
# Build Docker image
docker build -t sirubot:latest .

# Run container
docker run -d --name sirubot-container \
  -e DISCORD_TOKEN="your_token" \
  -e DATABASE_URL="your_db_url" \
  sirubot:latest
```

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
