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
