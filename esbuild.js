import * as esbuild from 'esbuild';

const config = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'ES2020',
  outdir: 'dist',
};

// ESM build
esbuild.build({
  ...config,
  format: 'esm',
  outExtension: { '.js': '.esm.js' },
}).catch(() => process.exit(1));

// CJS build
esbuild.build({
  ...config,
  format: 'cjs',
  outExtension: { '.js': '.js' },
}).catch(() => process.exit(1));
