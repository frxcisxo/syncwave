import * as esbuild from 'esbuild';

const config = {
  entryPoints: [
    'src/index.ts',
    'src/react.tsx',
    'src/server.ts',
    'src/adapters.ts',
    'src/sync.ts',
    'src/debugger.ts',
    'src/conflicts.tsx',
    'src/encryption.ts',
    'src/vue.ts',
    'src/svelte.ts',
  ],
  bundle: true,
  minify: true,
  sourcemap: true,
  target: 'ES2020',
  outdir: 'dist',
  external: ['react', 'react/jsx-runtime', 'vue'],
};

await Promise.all([
  esbuild.build({
    ...config,
    format: 'esm',
    outExtension: { '.js': '.esm.js' },
  }),
  esbuild.build({
    ...config,
    format: 'cjs',
    outExtension: { '.js': '.js' },
  }),
]).catch(() => process.exit(1));
