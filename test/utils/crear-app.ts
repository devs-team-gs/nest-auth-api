import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface ContextoE2E {
  app: NestExpressApplication;
  prisma: PrismaService;
}

/**
 * 🛑 El seguro más importante de toda la suite.
 *
 * limpiarBase() hace deleteMany() sobre todas las tablas. Si por lo que sea la app
 * terminó apuntando a la base de DESARROLLO, la primera corrida de e2e te la vacía y no
 * hay vuelta atrás.
 *
 * ¿Cómo podría pasar? @nestjs/config NO pisa las variables que ya están en process.env.
 * Si tu shell exporta DATABASE_URL, el envFilePath: '.env.test' del AppModule se ignora
 * en silencio. Por eso también el script test:e2e usa `dotenv -e .env.test --`: entre
 * las dos capas es muy difícil equivocarse, y si aun así pasa, este chequeo corta acá.
 */
function verificarQueApuntaALaBaseDeTest(): void {
  const url = process.env.DATABASE_URL ?? '';

  if (!url.includes('integrar_test')) {
    throw new Error(
      `🛑 DATABASE_URL no apunta a la base de test: "${url}"\n` +
        `   Corré los e2e con "pnpm test:e2e" (nunca con "jest" pelado).\n` +
        `   Si seguís, limpiarBase() te borra la base de desarrollo.`,
    );
  }
}

/**
 * Levanta la aplicación COMPLETA en memoria, con todos sus módulos, guards, pipes e
 * interceptors reales. Lo único que no hay es un servidor HTTP escuchando en un puerto:
 * supertest habla directo con el handler.
 */
export async function crearApp(): Promise<ContextoE2E> {
  verificarQueApuntaALaBaseDeTest();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  // El genérico <NestExpressApplication> es obligatorio: el INestApplication genérico no
  // tiene useBodyParser(), que es lo que usa configureApp para limitar el tamaño del body.
  const app = moduleRef.createNestApplication<NestExpressApplication>();

  // 👈 la línea que hace que esta app sea la MISMA que levanta main.ts
  configureApp(app);

  await app.init();

  // app.get() y no moduleRef.get(): es la instancia de ESTA app, la misma que va a
  // cerrar su conexión cuando llamemos a app.close().
  return { app, prisma: app.get(PrismaService) };
}
