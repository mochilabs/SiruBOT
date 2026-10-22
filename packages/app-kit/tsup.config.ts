import { createConfig } from '../../scripts/tsup.config.js';

// app-kit은 단일 export('.')만 제공해요 — entry를 index로 한정해 테스트 파일이 dist로 새지 않게 해요.
export default createConfig({
	entry: ['src/index.ts']
});
