import type { Context, Next } from 'hono'
import { createMiddleware } from 'hono/factory'
import { logger } from '../utils/logger'

// Re-export de los middleware nativos de Hono para conveniencia
export { logger as honoLogger } from 'hono/logger'
export { requestId as honoRequestId } from 'hono/request-id'

// Middleware personalizado para logging estructurado (complementa al de Hono)
export const structuredLoggingMiddleware = () => {
  return createMiddleware(async (c: Context, next: Next) => {
    const start = Date.now()
    const method = c.req.method
    const path = c.req.path
    const userAgent = c.req.header('user-agent')
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    const requestId = c.get('requestId') // Viene del middleware requestId de Hono

    // Log estructurado de inicio (opcional, complementa al de Hono)
    logger.info('Request metadata', {
      requestId,
      method,
      path,
      userAgent,
      ip,
      timestamp: new Date().toISOString()
    })

    await next()

    const duration = Date.now() - start
    const status = c.res.status

    // Log estructurado de finalización con métricas adicionales
    const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info'

    logger[logLevel]('Request metrics', {
      requestId,
      method,
      path,
      status,
      duration,
      responseSize: c.res.headers.get('content-length') || 'unknown',
      ...(status >= 400 && {
        errorType: status >= 500 ? 'server_error' : 'client_error'
      })
    })
  })
}

// Middleware de respuesta mejorada (añade headers útiles y timing)
export const enhancedResponseMiddleware = () => {
  return createMiddleware(async (c: Context, next: Next) => {
    // 🔥 AÑADIR: Configurar startTime para execution_time
    const startTime = Date.now()
    c.set('startTime', startTime)

    await next()

    // Añadir headers útiles
    const requestId = c.get('requestId')
    if (requestId) {
      c.res.headers.set('X-Request-ID', requestId)
    }

    // Headers de seguridad básicos (opcional)
    if (!c.res.headers.get('X-Content-Type-Options')) {
      c.res.headers.set('X-Content-Type-Options', 'nosniff')
    }

    if (!c.res.headers.get('X-Frame-Options')) {
      c.res.headers.set('X-Frame-Options', 'DENY')
    }
  })
}

// Middleware básico que combina timing y headers (alternativa todo-en-uno)
export const basicMiddleware = () => {
  return createMiddleware(async (c: Context, next: Next) => {
    // Configurar tiempo de inicio para execution_time
    const startTime = Date.now()
    c.set('startTime', startTime)

    await next()

    // Añadir headers de respuesta
    const requestId = c.get('requestId')
    if (requestId) {
      c.res.headers.set('X-Request-ID', requestId)
    }

    // Headers de seguridad
    c.res.headers.set('X-Content-Type-Options', 'nosniff')
    c.res.headers.set('X-Frame-Options', 'DENY')
  })
}
