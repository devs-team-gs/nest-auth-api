import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // ── Hardening ──────────────────────────────────────────────────────────────

  // Una docena de headers de seguridad (X-Frame-Options, HSTS, CSP...) y de paso
  // oculta el X-Powered-By: Express que le anuncia tu stack a cualquiera.
  app.use(helmet());

  // Límite de tamaño del body: para que nadie te tumbe el server mandando 500 MB.
  // (Es el equivalente nativo de Nest al `app.use(express.json({ limit: '1mb' }))`
  //  que se ve en muchos ejemplos, sin tener que importar express a mano.)
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  // ⚠️ CORS es una protección DEL NAVEGADOR, no de tu API: Postman y curl se lo
  // saltean porque no son navegadores. No reemplaza a la autenticación.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN'),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // ── Validación ─────────────────────────────────────────────────────────────

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // borra del body todo lo que no declare el DTO (frena mass assignment)
      forbidNonWhitelisted: true, // y además avisa con un 400 qué campo sobra
      transform: true, // convierte el objeto plano en instancia real del DTO
      transformOptions: {
        enableImplicitConversion: true, // "2" → 2 según el tipo declarado
      },
    }),
  );

  // ── Errores ────────────────────────────────────────────────────────────────

  // El detalle va al log, el mensaje genérico va al cliente.
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  console.log(`🚀 API escuchando en http://localhost:${port}`);
}

void bootstrap();
