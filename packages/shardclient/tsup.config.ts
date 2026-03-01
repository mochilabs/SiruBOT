import { createConfig } from '../../scripts/tsup.config.js';
    
export default createConfig({
    entry: ['src/index.ts', 'src/ws-types/index.ts'],
    format: ['cjs', 'esm'],
    splitting: false,
    dts: true
});