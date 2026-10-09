# Swarm 배포

기존 여러 노드 Swarm의 bot/dashboard/shardmanager/data-api를 한 명령으로 업데이트한다.
서버에서 소스 빌드나 Yarn 설치는 필요하지 않다. Swarm manager에 연결된 Docker CLI, Node 22+(권장: Node 24), GitHub CLI가 필요하다.
기존 앱 stack에 서비스 4개가 있어야 한다. 새 클러스터를 만들거나 기존 stack 이름을 변경하는 도구는 아니다.

## 최초 설정

저장소 루트에서 실행한다.

```bash
mkdir -p .deploy
cp docker/deploy.config.example.json .deploy/config.json
gh auth login
docker login ghcr.io
```

`.deploy/config.json`의 `appStack`, `infraStack`을 **현재 사용 중인 stack 이름**으로 바꾼다.
`envFile`은 이 JSON 파일을 기준으로 해석한다. 기본 예제 `../docker/.env`는 저장소의 `docker/.env`를 가리킨다.
서비스·볼륨 이름, replica 수와 배치 제약은 Docker에서 읽으며 설정 예제로 덮어쓰지 않는다.
state 파일은 기본 `.deploy/state/`에 저장한다. 이 폴더와 `.env`는 로컬에만 두며 Git/Docker 이미지에 포함하지 않는다.

공통 `.env`에는 기존 운영 설정과 다음 필수 항목이 필요하다. 값은 배포 출력에 표시하지 않는다.

- `DISCORD_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `LAVALINK_HOSTS`, `AUTH_KEY`
- `AUTH_DISCORD_ID`, `AUTH_DISCORD_SECRET`, `AUTH_SECRET` 또는 `NEXTAUTH_SECRET`

`.env`는 Node의 dotenv 파서로 읽는다. 셸 명령이나 `$VAR`, `${VAR}`를 실행·확장하지 않는다.
URL 등은 실제 값을 지정한다. 따옴표·공백·리터럴 `$`는 보존된다.
`.env`에 없는 기존 서비스 환경 변수는 유지한다. 환경 변수를 제거하려면 기존 서비스를 별도로 수정한다.

내부 연결은 설정 파일의 `botShardManagerUrl`(WS, `/ws` 포함), `dashboardShardManagerUrl`(HTTP),
`dataApiUrl`(HTTP)로 구분한다. 기본값은 기존 overlay network의 서비스 별칭을 사용한다.
봇/대시보드의 data-api 인증과 대시보드의 shardmanager 인증에는 공통 `AUTH_KEY`를 전달한다.
외부 서비스나 다른 포트를 쓰는 경우 이 URL 설정을 현재 운영 주소에 맞춘다.

## 이미지 빌드와 배포

beta/feat push에서 변경된 앱만 빌드하고 앱별 이미지 digest를 기록한다.
이전 **성공한 manifest의 커밋**과 비교하므로 중간에 실패·취소된 실행의 변경도 다음 빌드에 포함된다.
변경되지 않은 앱은 이전 digest를 계승하고, manifest가 없거나 artifact가 만료되면 전체 앱을 빌드한다.
문서 변경만으로는 자동 이미지 빌드를 시작하지 않는다.

첫 적용은 새 workflow가 beta에 반영된 뒤 성공한 이미지 빌드를 기다린다. 필요하면 수동으로 초기화한다.

```bash
gh workflow run docker-beta.yml --ref beta -f full_build=true
gh run list --workflow docker-beta.yml --branch beta
node scripts/deploy.mjs --dry-run
node scripts/deploy.mjs
```

성공한 CI의 `deployment-manifest` artifact에서 앱 4개의 고정 digest를 가져온다.
이동 태그 `:beta`를 직접 배포하지 않는다. 최신 **배포 가능한 성공 실행**을 선택하며 특정 실행도 지정할 수 있다.
새 manifest 처리 job과 배포 도구 테스트는 Node 24를 사용하고 패키지 매니저 자동 캐시를 비활성화한다.
기존 앱 빌드/운영 이미지는 Node 22를 유지한다. 기존 beta/feat/release 이미지 태그는 계속 발행한다. release manifest를 선택할 때는 설정의 branch를 해당 실행의 ref에 맞춘다.

```bash
node scripts/deploy.mjs --run 123456789
node scripts/deploy.mjs status
node scripts/deploy.mjs --config /absolute/path/config.json
```

배포 전 manager·필수 설정·이미지 접근을 검사한다. 현재 서비스 설정을 legacy Compose v3으로 변환해
`docker stack deploy --with-registry-auth`로 적용하고 replica 수렴과 task ID가 안정적인지 확인한다.
생성된 앱·인프라 stack을 모두 `docker stack config`로 검증한 뒤 업데이트한다. dry-run도 동일한 스키마 검사를 수행한다.
호스트 매핑은 Swarm의 `IP hostname`을 Compose 형식으로 변환하며 IPv6도 보존한다.
기본 제한은 10분, 확인 주기는 5초, 안정성 확인 기간은 30초다. 설정 파일에서 조절할 수 있다.
같은 이미지·설정은 다시 적용하지 않으므로 불필요한 재시작을 하지 않는다.
봇은 stop-first로 갱신하며 종료 유예는 기존 값과 30초 중 큰 값을 사용한다.
봇 이미지의 Prisma migration·Lavalink 세션 저장/복구 동작은 그대로다.

Swarm task 상태 확인은 실제 Discord·Lavalink·LLM 전체 기능 검사를 대체하지 않는다.
최초 적용 후 샤드 연결, 음악 재생과 재시작 복구, 이미지 렌더, 웹 라이브 상태를 확인한다.

## 인프라 옵션

```bash
node scripts/deploy.mjs --with-infra --dry-run
node scripts/deploy.mjs --with-infra
```

기본 배포는 기존 PostgreSQL/Redis/Lavalink를 건드리지 않는다.
`--with-infra`는 기존 Redis/PostgreSQL stack을 현재 구성으로 재적용하고 저장 노드를 고정한다.
인프라의 기존 환경 변수, 데이터 볼륨 이름, 실행 중인 이미지 digest를 사용한다. PostgreSQL major 버전을 올리지 않는다.
데이터 서비스는 replica 1개와 실행 중인 task가 필요하며, task와 서비스의 mount가 일치해야 한다.
PostgreSQL의 현재 `PGDATA`는 서비스 환경에 절대 경로로 명시되어 있어야 한다.
Redis가 외부 `.conf` 파일을 사용하는 경우 데이터 경로를 자동 확인할 수 없어 인프라 적용을 중단한다.
실제 사용 중인 볼륨과 저장 노드가 확정되지 않거나 이미지가 digest로 고정되지 않았으면 적용을 중단한다.
`node.id` 제약으로 다른 노드에 같은 이름의 빈 볼륨이 생기는 것을 방지한다.
현재 사용 이미지에 digest가 없다면 실제 실행 중인 버전의 digest를 확인해 기존 서비스를 먼저 고정한다.

Lavalink JAR·설정·플러그인은 저장소에서 관리되지 않으므로 이 옵션에 포함하지 않는다.

## 실패와 복원

```bash
node scripts/deploy.mjs rollback --dry-run
node scripts/deploy.mjs rollback
```

업데이트 전에 기존 앱 이미지와 설정을 `previous.json`에 권한 0600으로 저장한다.
실패한 배포의 `pending.json`은 유지한다. 같은 `--run`과 설정으로 재시도하면 원래 복원 지점을 덮어쓰지 않는다.
다른 버전으로 진행하려면 먼저 rollback한다. 복원은 앱 구성만 대상이며 DB migration·인프라·데이터는 되돌리지 않는다.
Swarm이 이미 원래 설정으로 자동 복원했다면 수동 rollback은 해당 설정과 실행 task가 일치하는지 확인하고 실패 배포 상태를 정리한다.
기존 설정 파일에 시크릿이 들어 있으므로 state 파일도 보호하고 같은 manager에서 배포 도구를 실행한다.
다른 manager에서 복원하려면 보호된 state 디렉터리도 함께 옮겨야 한다.

로컬 state 잠금과 Swarm의 `<stack>-deployment-lock` Docker config가 중복 배포를 막는다.
정상 종료 시 해제한다. 강제 종료 후에는 실행 중인 배포가 없는지 확인한 다음 잠금을 해제한다.

```bash
rm .deploy/state/lock
docker config rm <app-stack>-deployment-lock
# --with-infra 실행이 중단됐으면 infra stack의 잠금도 확인한다.
```

지원하지 않는 특수 서비스 설정은 적용 전에 중단하며 조용히 삭제하지 않는다.
예: replicated가 아닌 모드, 특수 컨테이너 권한, 익명/특수 볼륨, `ForceUpdate`가 설정된 서비스.
legacy Compose에서 지원하지 않는 supplementary groups와 DNS options도 업데이트 전에 거부한다.
동일 hostname에 여러 IP가 지정된 매핑은 Compose 변환에서 보존할 수 없어 적용을 중단한다.
배포 과정의 Docker/gh 출력에 설정 값이 포함될 수 있어 원문 stderr 대신 요약 오류를 표시한다.
실패 시 task 상태와 오류를 민감한 값을 가린 상태로 출력한다.

## 개발 검증

```bash
node --test scripts/deploy.test.mjs scripts/deployment-manifest.test.mjs scripts/deploy.compose.test.mjs
```

여러 노드의 실제 배포 검증은 별도 Docker-in-Docker manager/worker에서만 실행한다.
두 데몬에 `node:24-alpine`을 준비하고 manager에 worker를 join한 뒤 다음을 실행한다.
호스트 Swarm이나 운영 데몬을 테스트 대상으로 사용하지 않는다.
호스트의 bridge netfilter가 제공되지 않는 DinD 테스트 환경은 데몬에 `DOCKER_IGNORE_BR_NETFILTER_ERROR=1`을 설정한다.

```bash
SIRUBOT_SWARM_TEST_MANAGER=<disposable-manager-container> \
SIRUBOT_SWARM_TEST_WORKER=<disposable-worker-container> \
node --test scripts/deploy.swarm.test.mjs
```

테스트는 임시 stack/network/volume을 만들고 scale·배치·환경 값·재배포·복원·저장 볼륨을 확인한 뒤 정리한다.
실제 봇 토큰이나 운영 DB 연결은 사용하지 않는다.
Docker Hub 호출 제한을 피하려면 `SIRUBOT_SWARM_TEST_IMAGE`에 테스트 registry의 Node 24 이미지 digest를 지정한다.
테스트 registry가 HTTP라면 두 DinD 데몬에만 insecure registry를 설정하고 `SIRUBOT_SWARM_TEST_INSECURE=true`를 전달한다.
운영 GHCR 배포에는 이 테스트 옵션을 사용하지 않는다.
