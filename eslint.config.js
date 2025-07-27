import neostandard, { plugins } from 'neostandard'

export default [
  ...neostandard({
    ts: true,
    semi: false
  }),
  ...plugins['typescript-eslint'].configs.recommended,
  {
    rules: {
      // reglas personalizadas
    }
  }
]
