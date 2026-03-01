$ErrorActionPreference = "Stop"

Write-Host "[BUILD] Building Lavalink image..."

docker build `
    -t "sirubot/lavalink:latest" `
    -f docker/lavalink/Dockerfile `
    docker/lavalink

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to build lavalink"
    exit 1
}

Write-Host "[DONE] Lavalink image built"
