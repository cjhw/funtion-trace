import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'],  // 构建所有TypeScript文件
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: 'node16',
  outDir: 'dist',
  bundle: false,  // 使用bundleless模式
  external: [
    'rollup'
  ],
  banner: {
    js: '// @function-tracer/core - Function call tracing library'
  }
});