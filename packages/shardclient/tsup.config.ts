import { createConfig } from '../../scripts/tsup.config';
    
export default createConfig({
    entry: ['src/index.ts', 'src/ws-types/index.ts'],
    format: ['cjs', 'esm'],
    splitting: false,
});