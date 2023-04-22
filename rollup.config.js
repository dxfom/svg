import resolve from '@rollup/plugin-node-resolve'
import esbuild from 'rollup-plugin-esbuild'

export default {
  input: 'src/index.ts',
  output: {
    format: 'es',
    file: 'index.js',
  },
  external: id => id.startsWith('@dxfom/'),
  plugins: [
    resolve({
      extensions: ['.ts', '.tsx'],
    }),
    esbuild({
      jsxImportSource: '.',
    }),
  ],
  watch: {
    clearScreen: false,
  },
}
