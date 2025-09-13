import { defineConfig, type Options } from 'tsup';

const baseOptions: Options = {
	clean: true,
	entry: ['src/**/*.ts'],
	dts: true,
	minify: false,
	skipNodeModulesBundle: true,
	target: 'es2021',
	tsconfig: 'tsconfig.json',
	keepNames: true,
	treeshake: true,
    outDir: 'dist',
    format: 'cjs'
};

export const createConfig = (options: Partial<Options>) => {
    return defineConfig({ ...baseOptions, ...options });
};
