import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { crearApp } from './utils/crear-app';
import { limpiarBase } from './utils/limpiar-base';

/**
 * El "smoke test" de la aplicación: verifica que el cableado global quedó bien.
 *
 * Todo lo que se prueba acá está en app.module.ts y en configure-app.ts, o sea en los
 * archivos que el coverage unitario EXCLUYE. Es el mejor argumento a favor de los e2e:
 * el orden de los guards, el APP_PIPE y el filtro global tienen 0% de cobertura
 * unitaria por definición, y sin embargo son lo que sostiene toda la seguridad.
 */
describe('App (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await crearApp());
  });

  afterAll(async () => {
    await limpiarBase(prisma);
    await app.close();
  });

  it('GET /health responde 200 sin token porque está marcado con @Public()', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  it('GET /health devuelve status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
  });

  it('GET /users sin token devuelve 401 porque el AuthGuard es global', () => {
    // "Secure by default": ningún endpoint está protegido por olvido; están protegidos
    // todos, y abrir uno es una decisión explícita con @Public().
    return request(app.getHttpServer()).get('/users').expect(401);
  });

  it('manda los headers de seguridad de helmet', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('no anuncia el stack: no manda el header x-powered-by', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('una ruta inexistente devuelve el formato de error del AllExceptionsFilter', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-existe')
      .expect(404);

    expect(res.body).toMatchObject({
      statusCode: 404,
      path: '/no-existe',
      timestamp: expect.any(String),
    });
  });
});
