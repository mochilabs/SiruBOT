import { createConfig } from '../../scripts/tsup.config.ts';

export default createConfig({
    dts: false,
    format: 'esm',
    target: 'es2021',
    sourcemap: 'inline'
});