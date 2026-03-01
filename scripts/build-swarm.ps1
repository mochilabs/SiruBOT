param(
    [string[]]$Targets,
    [string]$Version
)

$ErrorActionPreference = "Stop"

$allTargets = @("bot", "shardmanager", "dashboard")

# Validate and set targets
if ($Targets.Count -gt 0) {
    foreach ($t in $Targets) {
        if ($t -notin $allTargets) {
            Write-Host "[ERROR] Unknown target: $t (available: $($allTargets -join ', '))"
            exit 1
        }
    }
    $targets = $Targets
} else {
    $targets = $allTargets
}

# Get version info from git
$GIT_HASH = (git rev-parse --short HEAD) 2>$null
if (-not $GIT_HASH) { $GIT_HASH = "unknown" }
$GIT_BRANCH = (git rev-parse --abbrev-ref HEAD) 2>$null
if (-not $GIT_BRANCH) { $GIT_BRANCH = "unknown" }

if ($Version) {
    $VERSION_TAG = $Version
} else {
    $BUILD_DATE = Get-Date -Format "yyyyMMdd-HHmm"
    $VERSION_TAG = "${GIT_HASH}-${BUILD_DATE}"
}

Write-Host "[BUILD] SiruBOT $VERSION_TAG ($GIT_BRANCH)"

foreach ($i in 0..($targets.Count - 1)) {
    $target = $targets[$i]
    $step = $i + 1
    Write-Host "[$step/$($targets.Count)] Building $target..."
    docker build `
        --target $target `
        --build-arg GIT_HASH=$GIT_HASH `
        --build-arg GIT_BRANCH=$GIT_BRANCH `
        --build-arg VERSION=$VERSION_TAG `
        -t "sirubot/${target}:latest" `
        -t "sirubot/${target}:${VERSION_TAG}" `
        .
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to build $target"
        exit 1
    }
}

Write-Host "[DONE] All images built: $VERSION_TAG"
Write-Host "[INFO] To deploy: docker stack deploy -c docker/docker-stack.yml sirubot"
