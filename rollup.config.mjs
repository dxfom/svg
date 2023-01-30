import babel from '@rollup/plugin-babel'
import resolve from '@rollup/plugin-node-resolve'

export default {
  input: 'src/index.ts',
  output: {
    format: 'es',
    file: 'index.mjs',
  },
  external: id => id.startsWith('@dxfom/'),
  plugins: [
    resolve({
      extensions: ['.ts', '.tsx'],
    }),
    babel({
      extensions: ['.ts', '.tsx'],
      presets: ['@babel/preset-typescript'],
      plugins: [
        [
          '@babel/plugin-transform-react-jsx',
          {
            runtime: 'automatic',
            importSource: '.',
          },
        ],
      ],
      babelHelpers: 'bundled',
    }),
  ],
  watch: {
    clearScreen: false,
  },
}
