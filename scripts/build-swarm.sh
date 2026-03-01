#!/bin/bash
set -e

ALL_TARGETS=("bot" "shardmanager" "dashboard")

# Validate and set targets
if [ $# -gt 0 ]; then
    TARGETS=("$@")
    for t in "${TARGETS[@]}"; do
        if [[ ! " ${ALL_TARGETS[*]} " =~ " ${t} " ]]; then
            echo "[ERROR] Unknown target: $t (available: ${ALL_TARGETS[*]})"
            exit 1
        fi
    done
else
    TARGETS=("${ALL_TARGETS[@]}")
fi

# Get version info from git
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
BUILD_DATE=$(date +"%Y%m%d-%H%M")
VERSION_TAG="${GIT_HASH}-${BUILD_DATE}"

echo "[BUILD] SiruBOT $VERSION_TAG ($GIT_BRANCH)"

TOTAL=${#TARGETS[@]}
for i in "${!TARGETS[@]}"; do
    target="${TARGETS[$i]}"
    step=$((i + 1))
    echo "[$step/$TOTAL] Building $target..."
    docker build \
        --target "$target" \
        --build-arg GIT_HASH="$GIT_HASH" \
        --build-arg GIT_BRANCH="$GIT_BRANCH" \
        --build-arg VERSION="$VERSION_TAG" \
        -t "sirubot/${target}:latest" \
        -t "sirubot/${target}:${VERSION_TAG}" \
        .
    if [ $? -ne 0 ]; then
        echo "[ERROR] Failed to build $target"
        exit 1
    fi
done

echo "[DONE] All images built: $VERSION_TAG"
echo "[INFO] To deploy: docker stack deploy -c docker/docker-stack.yml sirubot"
