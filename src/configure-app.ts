import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { Logger } from '@nestjs/common';

/**
 * Todo lo que NO puede vivir dentro de un módulo.
 *
 * ¿Por qué existe este archivo? Porque `main.ts` **no se ejecuta en los tests**.
 * `Test.createTestingModule(...).createNestApplication()` construye la app desde el
 * AppModule y nunca llama a `bootstrap()`. Si el helmet, el CORS y el filtro global
 * vivieran sueltos en main.ts, los e2e estarían probando una aplicación distinta de la
 * que corre en producción — y peor: pasarían igual, tapando el agujero.
 *
 * La regla para decidir dónde va cada cosa:
 * - Si se puede expresar como provider (`APP_PIPE`, `APP_GUARD`, `APP_INTERCEPTOR`),
 *   va al AppModule.
 * - Si es un método de la instancia de la app (`app.use`, `app.enableCors`,
 *   `app.useGlobalFilters`), va acá.
 *
 * Lo llaman `main.ts` y `test/utils/crear-app.ts`. Las dos apps quedan idénticas.
 */
export function configureApp(app: NestExpressApplication): void {
  const config = app.get(ConfigService);
  Logger.overrideLogger(false);

  // Headers de seguridad (y saca el x-powered-by, que le regala tu stack a cualquiera).
  app.use(helmet());

  // Límite de tamaño del body: sin esto, un POST de 2 GB te tumba el proceso.
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // El detalle al log, el mensaje genérico al cliente. Además unifica la FORMA de todas
  // las respuestas de error: { statusCode, path, timestamp, message }.
  app.useGlobalFilters(new AllExceptionsFilter());
}
