import { 
  createBasicAPI, 
  createSimpleAPI, 
  createProductionAPI, 
  createMinimalAPI,
  createApp 
} from '../src';

// Ejemplo 1: API básica con middleware nativo de Hono
const basicApp = createBasicAPI();

basicApp.get('/api/hello', (c) => {
  return c.json({ 
    message: 'Hello World con middleware nativo!',
    requestId: c.get('requestId') // Viene del middleware nativo requestId de Hono
  });
});

// Ejemplo 2: API simple para desarrollo con logging estructurado adicional
const devApp = createSimpleAPI({
  environment: 'development'
  // debug: true está por defecto, activa logging estructurado adicional
});

devApp.get('/api/users', (c) => {
  const requestId = c.get('requestId');
  return c.json({ 
    users: [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ],
    requestId 
  });
});

// Ejemplo 3: API de producción con configuración estricta
const prodApp = createProductionAPI();

prodApp.get('/api/secure', (c) => {
  return c.json({ 
    message: 'Endpoint de producción con middleware nativo optimizado',
    timestamp: new Date().toISOString(),
    requestId: c.get('requestId')
  });
});

// Ejemplo 4: API minimalista (solo request ID y CORS, sin logging)
const minimalApp = createMinimalAPI();

minimalApp.get('/api/fast', (c) => {
  return c.json({ 
    message: 'Endpoint ultra rápido sin logging',
    requestId: c.get('requestId')
  });
});

// Ejemplo 5: App personalizada con CORS dinámico y middleware nativo
const customApp = createApp({
  environment: 'production',
  cors: {
    origin: (origin, c) => {
      // Lógica personalizada para CORS usando función nativa de Hono
      const allowedDomains = [
        'https://myapp.com', 
        'https://admin.myapp.com',
        'https://mobile.myapp.com'
      ];
      return allowedDomains.includes(origin) ? origin : 'https://myapp.com';
    },
    credentials: true,
    maxAge: 86400,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  },
  logging: true,
  debug: false
});

customApp.get('/api/dynamic-cors', (c) => {
  return c.json({ 
    message: 'CORS dinámico con middleware nativo de Hono!',
    requestId: c.get('requestId')
  });
});

// Ejemplo 6: Usando request ID personalizado con header
customApp.use('/api/custom-id/*', async (c, next) => {
  // El middleware nativo de Hono ya maneja X-Request-Id automáticamente
  // Si viene en el header, lo usa; si no, genera uno nuevo
  console.log('Request ID actual:', c.get('requestId'));
  await next();
});

customApp.get('/api/custom-id/test', (c) => {
  return c.json({
    message: 'Endpoint con request ID personalizable',
    requestId: c.get('requestId'),
    note: 'Envía X-Request-Id en el header para usar tu propio ID'
  });
});

// Ejemplo 7: Middleware de autenticación con request tracking
customApp.use('/api/admin/*', async (c, next) => {
  const apiKey = c.req.header('x-api-key');
  const requestId = c.get('requestId'); // Siempre disponible
  
  if (!apiKey || apiKey !== 'secret-admin-key') {
    return c.json({ 
      error: 'Unauthorized',
      requestId,
      message: 'Valid API key required',
      timestamp: new Date().toISOString()
    }, 401);
  }
  
  await next();
});

customApp.get('/api/admin/dashboard', (c) => {
  return c.json({ 
    message: 'Admin dashboard data',
    requestId: c.get('requestId'),
    timestamp: new Date().toISOString(),
    data: {
      users: 150,
      revenue: 25000,
      orders: 89
    }
  });
});

// Ejemplo 8: Usando custom request ID en desarrollo
const devAppWithCustomId = createApp({
  environment: 'development',
  debug: true
});

// Para testing, puedes enviar tu propio request ID:
/*
curl -H "X-Request-Id: my-test-123" http://localhost:3000/api/test

El middleware nativo de Hono detectará el header y usará "my-test-123" 
en lugar de generar un UUID aleatorio
*/

devAppWithCustomId.get('/api/test', (c) => {
  return c.json({
    message: 'Testing con request ID personalizado',
    requestId: c.get('requestId'),
    tip: 'Envía X-Request-Id: tu-id en el header para personalizarlo'
  });
});

// Logging automático con Hono nativo mostrará:
// <-- GET /api/test
// --> GET /api/test 200 15ms

console.log('🚀 Ejemplos usando middleware NATIVO de Hono:');
console.log('✅ logger() - Logging automático optimizado');
console.log('✅ requestId() - Request ID con soporte para headers personalizados');
console.log('✅ cors() - CORS completo con funciones dinámicas');
console.log('✅ Headers de seguridad automáticos');
console.log('✅ Health checks y error handling mejorados');

// Para development/testing:
// export default basicApp;import { createBasicAPI, createSimpleAPI, createProductionAPI, createApp } from '../src';

// Ejemplo 1: API básica con configuración por defecto
const basicApp = createBasicAPI();

basicApp.get('/api/hello', (c) => {
  return c.json({ 
    message: 'Hello World!',
    requestId: c.get('requestId')
  });
});

// Ejemplo 2: API simple para desarrollo con CORS específico
const devApp = createSimpleAPI({
  environment: import { createBasicAPI, createSimpleAPI, createProductionAPI, createApp } from '../src';

// Ejemplo 1: API básica con configuración por defecto
const basicApp = createBasicAPI();

basicApp.get('/api/hello', (c) => {
  return c.json({ 
    message: 'Hello World!',
    requestId: c.get('requestId')
  });
});

// Ejemplo 2: API simple para desarrollo con CORS específico
const devApp = createSimpleAPI({
  environment: 'development',
  debug: true
});

devApp.get('/api/users', (c) => {
  const requestId = c.get('requestId');
  return c.json({ 
    users: [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' }
    ],
    requestId 
  });
});

// Ejemplo 3: API de producción con configuración estricta
const prodApp = createProductionAPI();

prodApp.get('/api/secure', (c) => {
  return c.json({ 
    message: 'This is a secure production endpoint',
    timestamp: new Date().toISOString()
  });
});

// Ejemplo 4: App personalizada con CORS avanzado usando Hono nativo
const customApp = createApp({
  environment: 'production',
  cors: {
    origin: (origin, c) => {
      // Lógica personalizada para CORS
      const allowedDomains = ['https://myapp.com', 'https://admin.myapp.com'];
      return allowedDomains.includes(origin) ? origin : 'https://myapp.com';
    },
    credentials: true,
    maxAge: 86400, // 24 horas
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-API-Key']
  },
  logging: true,
  debug: false
});

customApp.get('/api/dynamic-cors', (c) => {
  return c.json({ message: 'CORS dinámico funciona!' });
});

// Ejemplo 5: Middleware personalizado con request ID
customApp.use('/api/admin/*', async (c, next) => {
  const apiKey = c.req.header('x-api-key');
  const requestId = c.get('requestId');
  
  if (!apiKey || apiKey !== 'secret-admin-key') {
    return c.json({ 
      error: 'Unauthorized',
      requestId,
      message: 'Valid API key required' 
    }, 401);
  }
  
  await next();
});

customApp.get('/api/admin/dashboard', (c) => {
  return c.json({ 
    message: 'Admin dashboard data',
    requestId: c.get('requestId'),
    timestamp: new Date().toISOString()
  });
});

// Ejemplo 6: Usando múltiples orígenes con Array
const multiOriginApp = createApp({
  cors: {
    origin: [
      'https://app.example.com',
      'https://admin.example.com',
      'https://mobile.example.com'
    ],
    credentials: true
  }
});

multiOriginApp.get('/api/multi-origin', (c) => {
  return c.json({ message: 'Disponible desde múltiples orígenes' });
});

// Para desarrollo local, podrías usarlo así:
// export default basicApp; // Para Bun/Node.js
// export { basicApp as default }; // Para otros runtimes

console.log('🚀 Ejemplos de uso del package @my-org/hono-core');
console.log('✅ CORS nativo de Hono integrado');
console.log('✅ Logging mejorado con request tracking');
console.log('✅ Health checks y ready checks incluidos');
console.log('✅ Manejo de errores consistente');