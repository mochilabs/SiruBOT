import { createConfig } from '../../scripts/tsup.config.ts';

export default createConfig({
    dts: false,
    sourcemap: 'inline',
    format: 'esm',
    splitting: false,
});