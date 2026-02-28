#!/bin/bash
set -e

echo "[BUILD] Building Lavalink image..."

docker build \
    -t "sirubot/lavalink:latest" \
    -f docker/lavalink/Dockerfile \
    docker/lavalink

if [ $? -ne 0 ]; then
    echo "[ERROR] Failed to build lavalink"
    exit 1
fi

echo "[DONE] Lavalink image built"
