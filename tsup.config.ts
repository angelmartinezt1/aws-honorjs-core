import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    // Entry principal
    index: 'src/index.ts',

    // Submodules específicos para export maps
    'services/cache/index': 'src/services/cache/index.ts',
    'middleware/index': 'src/middleware/index.ts',
    'app/factory': 'src/app/factory.ts',
    'utils/index': 'src/utils/index.ts',
    'utils/logger': 'src/utils/logger.ts',
    'utils/transform': 'src/utils/transform.ts',
    'utils/response-helpers': 'src/utils/response-helpers.ts',
    'utils/response-types': 'src/utils/response-types.ts'
  },
  format: ['cjs', 'esm'],
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  target: 'node18',
  external: ['hono'],
  outDir: 'dist',

  // Configuración para generar archivos con las extensiones correctas
  outExtension ({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js'
    }
  },

  // Configurar para que genere tipos (.d.ts) automáticamente
  dts: true
})
