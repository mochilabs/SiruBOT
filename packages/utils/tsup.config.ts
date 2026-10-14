import { createConfig } from '../../scripts/tsup.config.js';
    
export default createConfig({
    entry: ['src/index.ts', 'src/time.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    shims: true,
});