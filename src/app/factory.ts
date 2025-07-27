import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { requestId as honoRequestId } from 'hono/request-id'
import { enhancedResponseMiddleware, structuredLoggingMiddleware } from '../middleware/basic'
import { logger } from '../utils/logger'
import type { AppContext, CoreAppOptions, CorsOptions } from './types'

/**
 * Crea una nueva aplicación Hono con configuración predefinida
 */
export function createApp<T extends AppContext = AppContext> (
  options: CoreAppOptions = {}
): Hono<T> {
  const {
    environment = process.env.NODE_ENV as any || 'development',
    debug = environment === 'development',
    cors: corsConfig = true,
    logging = true
  } = options

  // Crear la instancia de Hono
  const app = new Hono<T>()

  logger.info('Creating Hono app', {
    environment,
    debug,
    cors: !!corsConfig,
    logging
  })

  // 1. Request ID middleware (siempre primero)
  app.use('*', honoRequestId())

  // 2. Logging middleware nativo de Hono
  if (logging) {
    app.use('*', honoLogger())

    // Opcional: logging estructurado adicional para métricas
    if (debug) {
      app.use('*', structuredLoggingMiddleware())
    }
  }

  // 3. CORS middleware usando el oficial de Hono con configuración segura
  if (corsConfig) {
    let corsOptions: CorsOptions

    if (typeof corsConfig === 'object') {
      corsOptions = corsConfig
    } else {
      // Configuración por defecto segura basada en entorno
      if (environment === 'development') {
        corsOptions = {
          origin: '*',
          credentials: true,
          allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowHeaders: ['Content-Type', 'Authorization']
        }
      } else {
        // Configuración para producción con origins desde env
        const envOrigins = process.env.CORS_ORIGINS || ''
        const allowedOrigins = envOrigins.split(',').map(o => o.trim()).filter(Boolean)

        corsOptions = {
          origin: (origin: string) => {
            if (!origin) return null
            if (allowedOrigins.includes('*')) return '*'
            return allowedOrigins.includes(origin) ? origin : null
          },
          credentials: true,
          allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          allowHeaders: ['Content-Type', 'Authorization']
        }
      }
    }

    app.use('*', cors(corsOptions))
  }

  // 4. Enhanced response middleware (headers adicionales)
  app.use('*', enhancedResponseMiddleware())

  // Ruta de health check (siempre disponible)
  app.get('/health', (c) => {
    const uptime = process.uptime()
    const requestId = c.get('requestId')

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment,
      uptime: Math.floor(uptime),
      requestId,
      version: process.env.npm_package_version || '1.0.0',
      node: {
        version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    })
  })

  // Ruta de ready check (para k8s readiness probes)
  app.get('/ready', (c) => {
    return c.json({
      status: 'ready',
      timestamp: new Date().toISOString()
    })
  })

  // Manejador de errores mejorado
  app.onError((err, c) => {
    const requestId = c.get('requestId')

    logger.error('Unhandled error', {
      requestId,
      error: err.message,
      stack: debug ? err.stack : undefined,
      path: c.req.path,
      method: c.req.method,
      userAgent: c.req.header('user-agent')
    })

    return c.json({
      error: 'Internal Server Error',
      requestId,
      timestamp: new Date().toISOString(),
      ...(debug && {
        message: err.message,
        stack: err.stack?.split('\n').slice(0, 10) // Limitar stack trace
      })
    }, 500)
  })

  // Manejador 404 mejorado
  app.notFound((c) => {
    const requestId = c.get('requestId')

    logger.warn('Route not found', {
      requestId,
      path: c.req.path,
      method: c.req.method,
      userAgent: c.req.header('user-agent')
    })

    return c.json({
      error: 'Not Found',
      requestId,
      message: `Route ${c.req.method} ${c.req.path} not found`,
      timestamp: new Date().toISOString(),
      suggestion: 'Check the API documentation for available endpoints'
    }, 404)
  })

  logger.info('Hono app created successfully')

  return app
}

// Factory preconfigurados para casos comunes
export const createBasicAPI = (options: Partial<CoreAppOptions> = {}) =>
  createApp({
    cors: {
      origin: '*',
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization']
    },
    logging: true,
    ...options
  })

export const createSimpleAPI = (options: Partial<CoreAppOptions> = {}) =>
  createApp({
    cors: {
      origin: (origin: string) => {
        const allowedOrigins = ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080']
        if (!origin) return null
        return allowedOrigins.includes(origin) ? origin : null
      },
      credentials: true,
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization']
    },
    logging: true,
    debug: true, // Activa logging estructurado adicional
    ...options
  })

export const createProductionAPI = (options: Partial<CoreAppOptions> = {}) => {
  const envOrigins = process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGINS || ''
  const allowedOrigins = envOrigins.split(',').map(o => o.trim()).filter(Boolean)

  return createApp({
    environment: 'production',
    debug: false,
    cors: {
      origin: (origin: string, _c: any) => {
        if (!origin) return null
        if (allowedOrigins.includes('*')) return '*'
        return allowedOrigins.includes(origin) ? origin : null
      },
      credentials: true,
      maxAge: 86400, // 24 hours
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowHeaders: ['Content-Type', 'Authorization']
    },
    logging: true,
    ...options
  })
}

// Factory minimalista (solo request ID, sin CORS ni logging)
export const createMinimalAPI = (options: Partial<CoreAppOptions> = {}) =>
  createApp({
    logging: false,
    cors: false,
    ...options
  })
