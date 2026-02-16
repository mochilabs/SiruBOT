# 🎵 시루봇 (SiruBOT)

Discord 서버를 위한 음악 봇입니다. Lavalink 기반으로 안정적인 음악 스트리밍과 다양한 편의 기능을 제공합니다.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Discord.js](https://img.shields.io/badge/discord.js-v14.22.1-blue.svg)](https://discord.js.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9.2-blue.svg)](https://www.typescriptlang.org/)

---

## ✨ 주요 기능

### 🎵 음악 재생
- **다중 플랫폼 지원**: YouTube, Spotify, SoundCloud
- **플레이리스트 재생**: 대기열 관리 및 자동 재생
- **고음질 스트리밍**: Lavalink 기반 안정적인 음악 스트리밍
- **실시간 재생 컨트롤러**: Discord Components V2를 활용한 직관적인 UI

### 🎛️ 재생 제어
- **투표 스킵 시스템**: 공정한 곡 건너뛰기
- **반복 재생**: 한 곡 반복, 전체 반복, 끄기
- **볼륨 조절**: 0-150% 사이 자유로운 조절
- **자동 추천곡**: 관련 동영상 자동 재생

### ⚙️ 고급 기능
- **SponsorBlock 통합**: 자동 광고 구간 건너뛰기 (실험적)
- **DJ 역할 시스템**: 특정 역할에 권한 부여
- **Redis 캐싱**: 빠른 응답 속도와 데이터 복구
- **플레이어 Resume**: 봇 재시작 시 재생 상태 복구
- **재생 통계 추적**: Prisma를 통한 트랙 재생 횟수 기록

---

## 🛠️ 기술 스택

### Core
- **Runtime**: Node.js (TypeScript)
- **Discord Library**: [Discord.js](https://discord.js.org/) v14
- **Bot Framework**: [Sapphire Framework](https://www.sapphirejs.dev/) v5
- **Music Engine**: [Lavalink](https://lavalink.dev/) v4 (lavalink-client)

### Database & Cache
- **Database**: PostgreSQL (Prisma ORM)
- **Cache**: Redis (Bull Cache 패턴)
- **In-Memory Cache**: Custom MemoryCache implementation

### Infrastructure
- **Monorepo**: Turborepo
- **Build Tool**: tsup (esbuild wrapper)
- **Package Manager**: Yarn 4
- **Logging**: tslog

---

## 📦 프로젝트 구조

```
apps/bot/
├── src/
│   ├── core/                  # 핵심 시스템
│   │   ├── botApplication.ts  # 메인 봇 클래스
│   │   ├── bootstrap.ts       # 부트스트랩 로직
│   │   └── logger.ts          # 로깅 시스템
│   │
│   ├── modules/               # 기능 모듈
│   │   ├── audio/            # 음악 재생 모듈
│   │   │   ├── commands/     # 음악 관련 명령어
│   │   │   ├── lavalink/     # Lavalink 통합
│   │   │   │   ├── handlers/ # 이벤트 핸들러
│   │   │   │   ├── player/   # 플레이어 관리
│   │   │   │   └── queue/    # 큐 관리
│   │   │   ├── preconditions/ # 권한 체크
│   │   │   ├── view/         # UI 컴포넌트
│   │   │   └── managers/     # 비즈니스 로직
│   │   │
│   │   └── general/          # 일반 기능 모듈
│   │       ├── commands/     # 일반 명령어
│   │       └── listeners/    # 이벤트 리스너
│   │
│   ├── services/             # 서비스 레이어
│   │   ├── guildService.ts   # 길드 설정 관리
│   │   └── trackService.ts   # 트랙 통계 관리
│   │
│   └── types/                # 타입 정의
│       └── global.d.ts       # 글로벌 타입 확장
│
├── tests/                    # 테스트 (TODO)
└── package.json
```

---

## 🚀 시작하기

### 필수 요구사항

- **Node.js**: v20 이상
- **Yarn**: 4.x
- **PostgreSQL**: 14 이상
- **Redis**: 7 이상
- **Lavalink Server**: v4 이상

### 설치

1. **저장소 클론**
   ```bash
   git clone https://github.com/your-org/SiruBOT.git
   cd SiruBOT
   ```

2. **의존성 설치**
   ```bash
   yarn install
   ```

3. **환경 변수 설정**
   
   `.env` 파일을 프로젝트 루트에 생성:
   ```env
   # Discord
   DISCORD_TOKEN=your_discord_bot_token
   OWNERS=USER_ID_1 USER_ID_2
   
   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/sirubot
   
   # Redis
   REDIS_URL=redis://localhost:6379
   
   # Lavalink
   LAVALINK_HOSTS=[{"id":"main","host":"localhost","port":2333,"authorization":"youshallnotpass","secure":false}]
   
   # Logging
   LOGLEVEL=2
   
   # Optional
   BOT_ACTIVITY=음악 재생 중
   DEV_GUILD_IDS=GUILD_ID_1 GUILD_ID_2
   ```

4. **데이터베이스 마이그레이션**
   ```bash
   yarn migrate:dev
   ```

5. **빌드**
   ```bash
   yarn build
   ```

6. **실행**
   ```bash
   yarn start
   ```

### 개발 모드

```bash
# Watch 모드로 자동 재빌드
yarn watch

# 다른 터미널에서 실행
yarn start
```

---

## 🏗️ 개발 가이드

### 새로운 명령어 추가

1. `src/modules/audio/commands/` 또는 `src/modules/general/commands/`에 파일 생성
2. Sapphire의 `Command` 클래스 확장
3. `@ApplyOptions` 데코레이터로 설정 정의

```typescript
import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ChatInputCommandInteraction } from 'discord.js';

@ApplyOptions<Command.Options>({
  name: 'example',
  description: 'Example command',
  preconditions: ['VoiceConnected']
})
export class ExampleCommand extends Command {
  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) => {
      builder
        .setName(this.name)
        .setDescription(this.description);
    });
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    await interaction.reply('Hello!');
  }
}
```

### Precondition 추가

1. `src/modules/audio/preconditions/`에 파일 생성
2. `AllFlowsPrecondition` 확장
3. `global.d.ts`에 타입 추가

```typescript
import { AllFlowsPrecondition } from '@sapphire/framework';
import { CommandInteraction } from 'discord.js';

export class MyPrecondition extends AllFlowsPrecondition {
  public override chatInputRun(interaction: CommandInteraction) {
    // 조건 체크
    if (condition) return this.ok();
    return this.error({ message: 'Error message' });
  }
}
```

### 로깅

```typescript
// 컨테이너에서 로거 사용
this.container.logger.info('정보 메시지');
this.container.logger.error('에러 메시지', error);
this.container.logger.debug('디버그 메시지');
```

---

## 🔧 트러블슈팅

### Lavalink 연결 실패

1. Lavalink 서버가 실행 중인지 확인
2. `LAVALINK_HOSTS` 환경 변수 확인
3. 방화벽/포트 설정 확인

### Redis 연결 오류

- Redis 서버 상태 확인
- `REDIS_URL` 형식 확인
- 봇은 Redis 연결 실패 시 메모리 캐시로 폴백됨

### 데이터베이스 마이그레이션 실패

```bash
# 스키마 재동기화
yarn prisma generate
yarn migrate:dev --name init
```

### 봇이 응답하지 않음

1. 봇 토큰 확인
2. 필요한 Intent 권한 확인
3. 로그 확인: `LOGLEVEL=0` 설정 후 재시작

---

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 코드 스타일

```bash
# Prettier로 포맷팅
yarn lint:fix

# 타입 체크
yarn typecheck
```

---

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

---

## 🙏 감사의 말

- [Sapphire Framework](https://www.sapphirejs.dev/) - 강력한 Discord.js 프레임워크
- [Lavalink](https://lavalink.dev/) - 고성능 음악 스트리밍
- [Discord.js](https://discord.js.org/) - Discord API 래퍼

---

## 📧 연락처

문의사항이나 제안사항이 있으시면 이슈를 열어주세요!

---

<div align="center">
Made with ❤️ by SiruBOT Team
</div>
