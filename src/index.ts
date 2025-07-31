// src/index.ts - Solo exports básicos, sin re-exports

// Solo exports de tipos básicos y metadata
export type * from './types'

// Información del package
export const VERSION = '1.0.0'
export const BUILD_DATE = new Date().toISOString()

// ❌ NO re-exportar funciones específicas
// export * from './app'           // ELIMINADO
// export * from './middleware'    // ELIMINADO
// export * from './utils'         // ELIMINADO
// export * from './services/cache' // ELIMINADO

// Opcional: Función helper para indicar dónde importar
export function getImportPaths () {
  return {
    factory: '@my-org/hono-core/factory',
    cache: '@my-org/hono-core/cache',
    utils: '@my-org/hono-core/utils',
    middleware: '@my-org/hono-core/middleware'
  } as const
}
