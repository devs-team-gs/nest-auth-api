import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Helmet, body parser, CORS y el filtro global viven en configure-app.ts para que los
  // tests e2e puedan levantar EXACTAMENTE esta misma app. El ValidationPipe ya no está
  // acá: se registra como APP_PIPE en el AppModule (ver el comentario de app.module.ts).
  configureApp(app);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);

  console.log(`🚀 API escuchando en http://localhost:${port}`);
}

void bootstrap();
