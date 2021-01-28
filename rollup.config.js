import resolve from '@rollup/plugin-node-resolve'
import babel from 'rollup-plugin-babel'

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
        '@babel/plugin-proposal-optional-chaining',
        '@babel/plugin-proposal-nullish-coalescing-operator',
        [
          '@babel/plugin-transform-react-jsx',
          {
            runtime: 'automatic',
            importSource: '.',
          },
        ],
      ],
    })
  ],
}
