import { createConfig } from '../../scripts/tsup.config.ts';

export default createConfig({
    dts: true,
    format: 'esm',
    target: 'es2021',
    sourcemap: 'inline'
});