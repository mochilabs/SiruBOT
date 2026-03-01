import { createConfig } from '../../scripts/tsup.config.js';
    
export default createConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    shims: true,
});