import { beforeEach, describe, expect, it } from 'vitest'
import { createApp, createBasicAPI, createMinimalAPI, createProductionAPI, createSimpleAPI } from '../src/app/factory'
import { createErrorResponse, createSuccessResponse } from '../src/utils/response-helpers'

// Mock crypto.randomUUID para Node.js < 19
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123'
  }
})

describe('App Factory with Standard Response Middleware', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test'
  })

  it('should create a basic Hono app', () => {
    const app = createApp()
    expect(app).toBeDefined()
    expect(typeof app.get).toBe('function')
    expect(typeof app.post).toBe('function')
  })

  it('should create app with native middleware disabled', () => {
    const app = createApp({
      cors: false,
      logging: false
    })

    expect(app).toBeDefined()
  })

  it('should have health endpoint with standardized response format', async () => {
    const app = createApp({
      cors: false,
      logging: false
    })

    const req = new Request('http://localhost/health')
    const res = await app.request(req)

    expect(res.status).toBe(200)

    const body = await res.json()

    // Verificar nueva estructura estandarizada (snake_case)
    expect(body).toHaveProperty('metadata')
    expect(body).toHaveProperty('data')
    expect(body.metadata.success).toBe(true)
    expect(body.metadata.message).toBe('Service is healthy')
    expect(body.metadata.request_id).toBe('test-uuid-123')
    expect(body.data.status).toBe('ok')
    expect(body.data.environment).toBe('test')
  })

  it('should have ready endpoint with standardized format', async () => {
    const app = createApp({
      cors: false,
      logging: false
    })

    const req = new Request('http://localhost/ready')
    const res = await app.request(req)

    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.metadata.success).toBe(true)
    expect(body.metadata.message).toBe('Service is ready')
    expect(body.data.status).toBe('ready')
  })

  it('should set request ID header automatically', async () => {
    const app = createApp({
      cors: false,
      logging: false
    })

    const req = new Request('http://localhost/health')
    const res = await app.request(req)

    expect(res.headers.get('X-Request-ID')).toBe('test-uuid-123')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
  })

  it('should handle 404 errors with standardized format', async () => {
    const app = createApp({
      cors: false,
      logging: false
    })

    const req = new Request('http://localhost/nonexistent')
    const res = await app.request(req)

    expect(res.status).toBe(404)

    const body = await res.json()
    expect(body.metadata.success).toBe(false)
    expect(body.metadata.message).toContain('Route GET /nonexistent not found')
    expect(body.metadata.http_code).toBe(404)
    expect(body.metadata.request_id).toBe('test-uuid-123')
  })

  it('should handle errors in routes with standardized format', async () => {
    const app = createApp({
      debug: true,
      cors: false,
      logging: false
    })

    app.get('/error', () => {
      throw new Error('Test error')
    })

    const req = new Request('http://localhost/error')
    const res = await app.request(req)

    expect(res.status).toBe(500)

    const body = await res.json()
    expect(body.metadata.success).toBe(false)
    expect(body.metadata.message).toBe('Test error')
    expect(body.metadata.http_code).toBe(500)
    expect(body.metadata.request_id).toBe('test-uuid-123')
  })

  describe('Preset factories', () => {
    it('should create basic API', () => {
      const app = createBasicAPI()
      expect(app).toBeDefined()
    })

    it('should create simple API', () => {
      const app = createSimpleAPI()
      expect(app).toBeDefined()
    })

    it('should create production API', () => {
      const app = createProductionAPI()
      expect(app).toBeDefined()
    })

    it('should create minimal API', () => {
      const app = createMinimalAPI()
      expect(app).toBeDefined()
    })
  })

  describe('Response helpers', () => {
    it('should work with success helper', async () => {
      const app = createApp({
        cors: false,
        logging: false
      })

      app.get('/test', (c) => {
        return createSuccessResponse(c, {
          message: 'Test successful',
          data: { test: true }
        })
      })

      const req = new Request('http://localhost/test')
      const res = await app.request(req)

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.metadata.success).toBe(true)
      expect(body.data.test).toBe(true)
    })

    it('should work with error helper', async () => {
      const app = createApp({
        cors: false,
        logging: false
      })

      app.get('/test-error', (c) => {
        return createErrorResponse(c, {
          message: 'Test error',
          httpCode: 400
        })
      })

      const req = new Request('http://localhost/test-error')
      const res = await app.request(req)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.metadata.success).toBe(false)
      expect(body.metadata.message).toBe('Test error')
    })
  })
})
