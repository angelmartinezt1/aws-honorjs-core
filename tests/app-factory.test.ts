import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, createBasicAPI, createSimpleAPI, createProductionAPI, createMinimalAPI } from '../src/app/factory';

// Mock crypto.randomUUID para Node.js < 19
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-123'
  }
});

describe('App Factory with Native Hono Middleware', () => {
  beforeEach(() => {
    // Reset environment
    process.env.NODE_ENV = 'test';
  });

  it('should create a basic Hono app', () => {
    const app = createApp();
    expect(app).toBeDefined();
    expect(typeof app.get).toBe('function');
    expect(typeof app.post).toBe('function');
  });

  it('should create app with native middleware disabled', () => {
    const app = createApp({
      cors: false,
      logging: false
    });
    
    expect(app).toBeDefined();
  });

  it('should have health endpoint with enhanced info', async () => {
    const app = createApp();
    
    const req = new Request('http://localhost/health');
    const res = await app.request(req);
    
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.environment).toBe('test');
    expect(body.timestamp).toBeDefined();
    expect(body.requestId).toBe('test-uuid-123');
    expect(body.uptime).toBeDefined();
    expect(body.node).toBeDefined();
    expect(body.node.version).toBeDefined();
  });

  it('should have ready endpoint', async () => {
    const app = createApp();
    
    const req = new Request('http://localhost/ready');
    const res = await app.request(req);
    
    expect(res.status).toBe(200);
    
    const body = await res.json();
    expect(body.status).toBe('ready');
    expect(body.timestamp).toBeDefined();
  });

  it('should set request ID header automatically', async () => {
    const app = createApp();
    
    const req = new Request('http://localhost/health');
    const res = await app.request(req);
    
    expect(res.headers.get('X-Request-ID')).toBe('test-uuid-123');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('should handle 404 errors with enhanced info', async () => {
    const app = createApp();
    
    const req = new Request('http://localhost/nonexistent');
    const res = await app.request(req);
    
    expect(res.status).toBe(404);
    
    const body = await res.json();
    expect(body.error).toBe('Not Found');
    expect(body.requestId).toBe('test-uuid-123');
    expect(body.message).toContain('Route GET /nonexistent not found');
    expect(body.timestamp).toBeDefined();
    expect(body.suggestion).toBeDefined();
  });

  it('should handle errors in routes with enhanced info', async () => {
    const app = createApp({ debug: true });
    
    app.get('/error', () => {
      throw new Error('Test error');
    });
    
    const req = new Request('http://localhost/error');
    const res = await app.request(req);
    
    expect(res.status).toBe(500);
    
    const body = await res.json();
    expect(body.error).toBe('Internal Server Error');
    expect(body.requestId).toBe('test-uuid-123');
    expect(body.message).toBe('Test error');
    expect(body.timestamp).toBeDefined();
    expect(body.stack).toBeDefined();
  });

  describe('Preset factories', () => {
    it('should create basic API', () => {
      const app = createBasicAPI();
      expect(app).toBeDefined();
    });

    it('should create simple API with debug logging', () => {
      const app = createSimpleAPI();
      expect(app).toBeDefined();
    });

    it('should create production API', () => {
      const app = createProductionAPI();
      expect(app).toBeDefined();
    });

    it('should create minimal API without logging', () => {
      const app = createMinimalAPI();
      expect(app).toBeDefined();
    });

    it('should override preset options', () => {
      const app = createBasicAPI({
        environment: 'production',
        cors: false
      });
      expect(app).toBeDefined();
    });
  });

  describe('Native Hono middleware integration', () => {
    it('should work with native request ID middleware', async () => {
      const app = createApp();
      
      app.get('/test', (c) => {
        const requestId = c.get('requestId');
        return c.json({ requestId });
      });
      
      const req = new Request('http://localhost/test');
      const res = await app.request(req);
      
      const body = await res.json();
      expect(body.requestId).toBe('test-uuid-123');
    });

    it('should work with custom request ID in header', async () => {
      const app = createApp();
      
      app.get('/test', (c) => {
        const requestId = c.get('requestId');
        return c.json({ requestId });
      });
      
      const req = new Request('http://localhost/test', {
        headers: {
          'X-Request-Id': 'custom-id-456'
        }
      });
      
      const res = await app.request(req);
      
      const body = await res.json();
      expect(body.requestId).toBe('custom-id-456');
    });
  });
});