import { createConfig } from '../../scripts/tsup.config.js';
    
export default createConfig({
    // 서브패스 export(./time ./sentry ./customCommand ./playerState ./guildData ./memberGreeting)와 1:1 대응해요.
    // 루트(index)는 노드 전용·무거운 의존이 섞이므로, 클라이언트 번들로 들어가는 계약 모듈은 서브패스로만 써요.
    entry: ['src/index.ts', 'src/time.ts', 'src/sentry.ts', 'src/customCommand.ts', 'src/playerState.ts', 'src/guildData.ts', 'src/memberGreeting.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    shims: true
});