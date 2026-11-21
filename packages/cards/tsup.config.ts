import { createConfig } from '../../scripts/tsup.config.js';

// 단일 export('.')만 제공해요 — entry를 index로 한정해 테스트 파일이 dist로 새지 않게 해요.
// 루트 export는 대시보드 번들에도 들어가니 node 전용 모듈(node:fs, Buffer, resvg 등)을 import하면 안 돼요.
export default createConfig({
	entry: ['src/index.ts']
});
