import type { Context, Next } from 'hono'
import { createMiddleware } from 'hono/factory'

/**
 * Middleware simple que registra el tiempo de inicio para calcular execution time
 */
export const standardResponseMiddleware = () => {
  return createMiddleware(async (c: Context, next: Next) => {
    // Solo registrar el tiempo de inicio
    const startTime = Date.now()
    c.set('startTime', startTime)

    await next()
  })
}
