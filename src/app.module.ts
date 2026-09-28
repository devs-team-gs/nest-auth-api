import {
  ClassSerializerInterceptor,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/guards/auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { validate } from './config/env.validation';
import { PostsModule } from './posts/posts.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // isGlobal: disponible en toda la app sin re-importar.
    // validate: si falta o es inválida cualquier variable requerida, la app NO arranca.
    // envFilePath: en tests leemos .env.test, que apunta a OTRA base de datos. Sin esto
    // los e2e corren contra la base de desarrollo y limpiarBase() te la vacía.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
      validate,
    }),

    // Forma de objeto (no de array) porque necesitamos `skipIf`. Con la forma de array
    // no hay dónde ponerlo.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'short', ttl: 1000, limit: 3 }, // 3 requests por segundo
        { name: 'long', ttl: 60000, limit: 100 }, // 100 por minuto
      ],
      // Sin esto, cualquier suite e2e que dispare 4 requests seguidos se come un 429 y
      // falla de forma intermitente según lo rápida que sea la máquina.
      // La excepción es test/throttler.e2e-spec.ts, que prende THROTTLE_E2E para probar
      // justamente el rate limiting.
      //
      // ⚠️ THROTTLE_E2E se lee de process.env y no del ConfigService porque `skipIf` es
      // un closure suelto dentro de las opciones del módulo: no pasa por el inyector de
      // dependencias, así que no hay ningún ConfigService al que pedírsela.
      skipIf: () =>
        process.env.NODE_ENV === 'test' && process.env.THROTTLE_E2E !== 'true',
    }),

    PrismaModule,
    UsersModule,
    // AuthModule exporta JwtModule: es lo que le permite al AuthGuard global
    // inyectar JwtService.
    AuthModule,
    PostsModule,
  ],
  controllers: [AppController],
  providers: [
    // El ValidationPipe vive acá y no en main.ts porque createNestApplication() (el que
    // usan los tests) no ejecuta main.ts. Si estuviera allá, en los e2e NO habría
    // validación: un POST /auth/register con un email inválido devolvería 201 y el test
    // de mass assignment pasaría en verde sin probar absolutamente nada.
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    },

    // ⚠️ EL ORDEN IMPORTA. Con APP_GUARD, los guards corren en el orden en que están
    // declarados los TOKENS APP_GUARD en este array. El RolesGuard lee `request.user`,
    // que lo pone el AuthGuard: si corriera primero, sería undefined y todo se rompe.
    //
    // 💡 Por qué `useExisting` y no `useClass`: con useClass la clase NO existe como
    // provider (Nest instancia una copia detrás del token APP_GUARD), y entonces
    // `.overrideProvider(AuthGuard)` en un test no hace absolutamente nada. Declarando
    // el guard como provider normal + useExisting, el token APP_GUARD apunta a ESA
    // instancia y el override funciona.
    { provide: APP_GUARD, useClass: ThrottlerGuard }, // 1º: ¿no estás abusando?

    AuthGuard,
    { provide: APP_GUARD, useExisting: AuthGuard }, // 2º: ¿quién sos?

    RolesGuard,
    { provide: APP_GUARD, useExisting: RolesGuard }, // 3º: ¿qué podés hacer?

    // Segunda capa contra la filtración de datos: borra del JSON todo lo marcado con
    // @Exclude() en las entities (ver users/entities/user.entity.ts).
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule {}
