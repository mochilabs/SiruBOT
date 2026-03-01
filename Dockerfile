# Base configuration
FROM node:22-slim AS base

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    git \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare yarn@4.12.0

# Pruned monorepo (dependencies only)
FROM base AS deps
WORKDIR /app

# Copy workspace configuration
COPY package.json yarn.lock turbo.json .yarnrc.yml ./

# Copy all package.json files to establish workspace structure
COPY apps/bot/package.json ./apps/bot/
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/shardmanager/package.json ./apps/shardmanager/
COPY packages/prisma/package.json ./packages/prisma/
COPY packages/shardclient/package.json ./packages/shardclient/
COPY packages/utils/package.json ./packages/utils/

# Install dependencies
RUN yarn install --immutable

# Builder base - includes all source files
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/.yarn ./.yarn
COPY --from=deps /app/package.json ./package.json
COPY --from=deps /app/yarn.lock ./yarn.lock
COPY --from=deps /app/turbo.json ./turbo.json
COPY --from=deps /app/.yarnrc.yml ./.yarnrc.yml

# Copy all source files
COPY tsconfig.json ./
COPY tsconfig.base.json ./
COPY scripts ./scripts
COPY apps ./apps
COPY packages ./packages

# Version info from build args
ARG GIT_HASH=unknown
ARG GIT_BRANCH=unknown
ARG VERSION=unknown

# Enable Turbo cache for Docker
ENV TURBO_TELEMETRY_DISABLED=1

# Generate Prisma client with correct binary targets
RUN cd packages/prisma && yarn run generate

# Build bot
FROM builder AS builder-bot
RUN --mount=type=cache,target=/app/.turbo \
    yarn turbo run build --filter=@sirubot/bot...

# Build dashboard
FROM builder AS builder-dashboard
RUN --mount=type=cache,target=/app/.turbo \
    yarn turbo run build --filter=@sirubot/dashboard...

# Build shardmanager
FROM builder AS builder-shardmanager
RUN --mount=type=cache,target=/app/.turbo \
    yarn turbo run build --filter=@sirubot/shardmanager...

# ====================
# Bot Production
# ====================
FROM node:22-slim AS bot
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs sirubot

ARG GIT_HASH=unknown
ARG GIT_BRANCH=unknown
ARG VERSION=unknown

ENV NODE_ENV=production
ENV GIT_HASH=$GIT_HASH
ENV GIT_BRANCH=$GIT_BRANCH
ENV VERSION=$VERSION

# Copy built application
COPY --from=builder-bot --chown=sirubot:nodejs /app/apps/bot/dist ./dist
COPY --from=builder-bot --chown=sirubot:nodejs /app/apps/bot/package.json ./package.json

# Copy workspace packages
COPY --from=builder-bot --chown=sirubot:nodejs /app/packages ./packages

# Copy only production node_modules
COPY --from=builder-bot --chown=sirubot:nodejs /app/node_modules ./node_modules

USER sirubot

CMD ["yarn", "start"]

# ====================
# Dashboard Production
# ====================
FROM node:22-slim AS dashboard
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

ARG VERSION=unknown
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV VERSION=$VERSION

# Copy built Next.js application
COPY --from=builder-dashboard --chown=nextjs:nodejs /app/apps/dashboard/.next/standalone ./
COPY --from=builder-dashboard --chown=nextjs:nodejs /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder-dashboard --chown=nextjs:nodejs /app/apps/dashboard/public ./apps/dashboard/public

# Copy Prisma client
COPY --from=builder-dashboard --chown=nextjs:nodejs /app/packages/prisma/dist ./packages/prisma/dist

USER nextjs
EXPOSE 3000

CMD ["node", "apps/dashboard/server.js"]

# ====================
# Shardmanager Production
# ====================
FROM node:22-slim AS shardmanager
WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Add non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs sirubot

ARG GIT_HASH=unknown
ARG GIT_BRANCH=unknown
ARG VERSION=unknown
ENV NODE_ENV=production
ENV GIT_HASH=$GIT_HASH
ENV GIT_BRANCH=$GIT_BRANCH
ENV VERSION=$VERSION

# Copy built application
COPY --from=builder-shardmanager --chown=sirubot:nodejs /app/apps/shardmanager/dist ./dist
COPY --from=builder-shardmanager --chown=sirubot:nodejs /app/apps/shardmanager/package.json ./package.json

# Copy workspace packages
COPY --from=builder-shardmanager --chown=sirubot:nodejs /app/packages ./packages

# Copy only production node_modules
COPY --from=builder-shardmanager --chown=sirubot:nodejs /app/node_modules ./node_modules

USER sirubot
EXPOSE 3001

CMD ["yarn", "start"]
