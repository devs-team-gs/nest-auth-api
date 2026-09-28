import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { PASSWORD_VALIDA } from './utils/factories';
import { crearApp } from './utils/crear-app';
import { limpiarBase } from './utils/limpiar-base';

/**
 * La ÚNICA suite donde el rate limiting no se saltea.
 *
 * En app.module.ts el ThrottlerModule tiene:
 *   skipIf: () => process.env.NODE_ENV === 'test' && process.env.THROTTLE_E2E !== 'true'
 *
 * Sin ese skipIf, cualquier suite e2e que dispare 4 requests seguidos se comería un 429
 * y fallaría de forma intermitente según lo rápida que sea la máquina. Pero apagar el
 * throttler para siempre significaría no probarlo nunca — así que se apaga con una
 * variable de entorno propia que solo este archivo prende.
 *
 * ⚠️ El `delete` del afterAll NO es opcional: con maxWorkers: 1 todos los archivos e2e
 * comparten el mismo proceso de Node. Si la variable quedara seteada, las suites que
 * corran después empezarían a comerse 429.
 */
describe('Throttler (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.THROTTLE_E2E = 'true';
    ({ app, prisma } = await crearApp());
  });

  beforeEach(async () => {
    await limpiarBase(prisma);
    // Un segundo de descanso para que expire el ttl del throttler `short` y cada test
    // arranque con el contador en cero.
    await new Promise((r) => setTimeout(r, 1100));
  });

  afterAll(async () => {
    await limpiarBase(prisma);
    await app.close();
    delete process.env.THROTTLE_E2E;
  });

  describe('throttler "short" por defecto: 3 requests por segundo', () => {
    // Se prueba sobre GET /posts (@Public, sin override) y no sobre POST /auth/login,
    // porque el login tiene su propio @Throttle mucho más estricto. Ver el describe
    // de abajo.

    it('deja pasar los primeros tres requests dentro del mismo segundo', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/posts').expect(200);
      }
    });

    it('devuelve 429 en el CUARTO request', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/posts').expect(200);
      }

      await request(app.getHttpServer()).get('/posts').expect(429);
    });

    it('vuelve a responder 200 después de esperar el ttl', async () => {
      for (let i = 0; i < 4; i++) {
        await request(app.getHttpServer()).get('/posts');
      }

      // El ttl del throttler `short` es de 1 segundo: la recuperación es barata.
      await new Promise((r) => setTimeout(r, 1100));

      await request(app.getHttpServer()).get('/posts').expect(200);
    });
  });

  describe('override de POST /auth/login: 5 intentos por minuto', () => {
    // 📌 El pedido original (y docs/clase-39.md) dicen "cuatro logins → el cuarto da
    // 429". No es así en esta API: auth.controller.ts tiene
    // @Throttle({ short: { limit: 5, ttl: seconds(60) } }) sobre el login, así que el
    // que corta es el SEXTO. Es el endpoint más atacado de cualquier API y por eso
    // tiene un límite propio, más estricto en ventana y más permisivo en cantidad.

    /** Email inexistente a propósito: el 401 sale antes de llegar a bcrypt.compare, así
     *  que los cinco intentos previos cuestan microsegundos en vez de medio segundo. */
    const intento = () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nadie@integrar.com', password: PASSWORD_VALIDA });

    it('deja pasar cinco intentos de login', async () => {
      for (let i = 0; i < 5; i++) {
        await intento().expect(401);
      }
    });

    it('devuelve 429 en el SEXTO intento', async () => {
      for (let i = 0; i < 5; i++) {
        await intento();
      }

      await intento().expect(429);
    });

    // No hay test de recuperación acá: el ttl es de 60 segundos y esperarlo sería un
    // minuto de suite parada. Lo que importa —que el límite existe y corta— ya está
    // probado, y la recuperación del mecanismo se prueba arriba con el ttl de 1 s.
  });

  describe('@SkipThrottle() en /health', () => {
    it('🐛 NO exime al healthcheck: el @SkipThrottle() sin argumentos no hace nada', async () => {
      // ⚠️ ESTE TEST DOCUMENTA UN BUG REAL DE LA API, no la conducta deseada.
      //
      // app.controller.ts pone @SkipThrottle() sobre /health con el comentario
      // "un healthcheck no necesita límite de requests". Pero no lo exime de nada:
      //
      //   · @SkipThrottle() sin argumentos usa el default `{ default: true }` y escribe
      //     la metadata bajo la clave THROTTLER_SKIP + 'default'.
      //   · El ThrottlerGuard, para cada throttler configurado, lee
      //     THROTTLER_SKIP + <nombre>. Acá los throttlers se llaman 'short' y 'long'
      //     (app.module.ts), así que busca 'skip_short' y 'skip_long' y no encuentra nada.
      //
      // Resultado: el healthcheck está limitado a 3 req/s como cualquier otra ruta. Un
      // balanceador que lo consulte seguido se come 429 y marca el servicio como caído.
      //
      // ✅ El arreglo es una línea: @SkipThrottle({ short: true, long: true })
      //    Cuando se aplique, este test se pone rojo — y ahí hay que darlo vuelta y
      //    esperar los veinte 200 que el comentario del código promete.
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer()).get('/health').expect(200);
      }

      await request(app.getHttpServer()).get('/health').expect(429);
    });
  });
});
